"""
pygame_runner.py
────────────────
Wraps student pygame code transparently:
  - Offscreen SDL rendering  (no Xvfb / X11 needed)
  - Captures frames on every display.flip() / display.update()
  - Streams JPEG frames over WebSocket to Node proxy
  - Injects mouse/keyboard events directly into pygame event queue
  - PulseAudio handles audio (captured separately by Node via parec|ffmpeg)

Usage:  python3 pygame_runner.py /tmp/main.py
"""

import os, sys, io, json, threading, queue, asyncio, traceback

# ── Must set BEFORE pygame import ──────────────────────────────
os.environ.setdefault('SDL_VIDEODRIVER', 'offscreen')
os.environ.setdefault('SDL_AUDIODRIVER', 'pulse')
os.environ.setdefault('PULSE_SERVER',    'unix:/tmp/pulse/native')

import pygame
import websockets
from PIL import Image

# ── Config ──────────────────────────────────────────────────────
WS_PORT      = 7777
TARGET_FPS   = 30
JPEG_QUALITY = 72          # 65-80 is sweet spot; lower = faster, worse quality
DEFAULT_SIZE = (800, 600)

# ── Shared state ────────────────────────────────────────────────
_frame_q  = queue.Queue(maxsize=3)   # drop frames if browser is slow
_input_q  = queue.Queue()
_clients  = set()
_screen   = None                     # set after pygame.init()
_running  = True
_orig_pygame_quit = None
_mouse_pos = (0, 0)
_mouse_buttons = [0, 0, 0, 0, 0]

# ── WebSocket server (runs in a background thread) ───────────────

async def _client_handler(ws):
    _clients.add(ws)
    try:
        async for msg in ws:
            try:
                data = json.loads(msg)
                _input_q.put_nowait(data)
            except Exception as e:
                print(f'[runner] Error parsing input: {e}', flush=True)
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        _clients.discard(ws)

async def _frame_broadcaster():
    while _running:
        try:
            frame = _frame_q.get_nowait()
            dead  = set()
            for ws in list(_clients):
                try:
                    await ws.send(frame)
                except Exception:
                    dead.add(ws)
            _clients.difference_update(dead)
        except queue.Empty:
            pass
        await asyncio.sleep(0.001)   # yield to event loop

_ws_ready = threading.Event()

async def _ws_main():
    async with websockets.serve(_client_handler, '0.0.0.0', WS_PORT):
        print(f'[runner] WS server ready on :{WS_PORT}', flush=True)
        _ws_ready.set()
        await asyncio.sleep(0.5)  # Ensure socket is fully accepting connections
        await _frame_broadcaster()

def _start_ws_thread():
    try:
        asyncio.run(_ws_main())
    except Exception as e:
        print(f'[runner] WS thread error: {e}', flush=True)
        traceback.print_exc()

threading.Thread(target=_start_ws_thread, daemon=True).start()
_ws_ready.wait(timeout=5)  # Wait up to 5 seconds for WS to be ready

# ── Frame capture helpers ────────────────────────────────────────

_last_frame_tick = 0
_frame_interval  = 1000 // TARGET_FPS   # ms

def _capture_and_queue():
    global _last_frame_tick, _screen
    if _screen is None:
        return
    now = pygame.time.get_ticks()
    if now - _last_frame_tick < _frame_interval:
        return
    _last_frame_tick = now
    try:
        w, h = _screen.get_size()
        raw  = pygame.image.tobytes(_screen, 'RGB')
        img  = Image.frombytes('RGB', (w, h), raw)
        buf  = io.BytesIO()
        img.save(buf, 'JPEG', quality=JPEG_QUALITY, optimize=False)
        # Non-blocking put — drop frame if queue full (browser too slow)
        _frame_q.put_nowait(buf.getvalue())
    except Exception:
        pass

# ── Pygame monkey-patches ────────────────────────────────────────

def _patch_pygame():
    global _screen, _orig_pygame_quit

    # ── display.set_mode ──────────────────────────────────────
    _orig_set_mode = pygame.display.set_mode
    def _set_mode(size=DEFAULT_SIZE, flags=0, depth=0, display=0, vsync=0):
        global _screen
        _screen = _orig_set_mode(size, flags, depth, display, vsync)
        return _screen
    pygame.display.set_mode = _set_mode

    # ── display.flip ──────────────────────────────────────────
    _orig_flip = pygame.display.flip
    def _flip():
        _orig_flip()
        _capture_and_queue()
    pygame.display.flip = _flip

    # ── display.update ────────────────────────────────────────
    _orig_update = pygame.display.update
    def _update(*args):
        _orig_update(*args)
        _capture_and_queue()
    pygame.display.update = _update

    # ── pygame.quit — prevent student from killing the runner ─
    _orig_pygame_quit = pygame.quit
    def _quit():
        pass   # swallow; runner manages lifecycle
    pygame.quit = _quit

# ── Input injection ──────────────────────────────────────────────

# Browser KeyboardEvent.code → pygame key constant
_KEYMAP = {
    'ArrowLeft':   pygame.K_LEFT,   'ArrowRight': pygame.K_RIGHT,
    'ArrowUp':     pygame.K_UP,     'ArrowDown':  pygame.K_DOWN,
    'Space':       pygame.K_SPACE,  'Enter':      pygame.K_RETURN,
    'Escape':      pygame.K_ESCAPE, 'Backspace':  pygame.K_BACKSPACE,
    'Tab':         pygame.K_TAB,    'Delete':     pygame.K_DELETE,
    'Home':        pygame.K_HOME,   'End':        pygame.K_END,
    'PageUp':      pygame.K_PAGEUP, 'PageDown':   pygame.K_PAGEDOWN,
    'ShiftLeft':   pygame.K_LSHIFT, 'ShiftRight': pygame.K_RSHIFT,
    'ControlLeft': pygame.K_LCTRL, 'ControlRight': pygame.K_RCTRL,
    'AltLeft':     pygame.K_LALT,  'AltRight':    pygame.K_RALT,
    'F1': pygame.K_F1, 'F2': pygame.K_F2, 'F3': pygame.K_F3,
    'F4': pygame.K_F4, 'F5': pygame.K_F5,
}

def _resolve_key(code, char):
    if code in _KEYMAP:
        return _KEYMAP[code]
    # AlphaNumeric: code is like 'KeyA', 'Digit1'
    if code.startswith('Key') and len(code) == 4:
        return ord(code[3].lower())
    if code.startswith('Digit') and len(code) == 6:
        return ord(code[5])
    if char and len(char) == 1:
        return ord(char.lower())
    return 0

def _pump_input():
    """Drain input_q and post as pygame events. Called from patched event.get()."""
    global _mouse_pos, _mouse_buttons, _screen
    while not _input_q.empty():
        try:
            d = _input_q.get_nowait()
        except queue.Empty:
            break
        t = d.get('type')
        try:
            if t == 'mousemove' or t == 'mousedown' or t == 'mouseup':
                # Scale coordinates from canvas (800x600) to actual pygame surface
                canvas_w, canvas_h = 800, 600
                if _screen is not None:
                    surf_w, surf_h = _screen.get_size()
                    x = d['x'] * surf_w / canvas_w
                    y = d['y'] * surf_h / canvas_h
                else:
                    x, y = d['x'], d['y']
                _mouse_pos = (int(x), int(y))
                button = d.get('button', 1)
                if isinstance(button, int) and 1 <= button <= len(_mouse_buttons):
                    if t == 'mousedown':
                        _mouse_buttons[button - 1] = 1
                    elif t == 'mouseup':
                        _mouse_buttons[button - 1] = 0

                if t == 'mousemove':
                    pygame.event.post(pygame.event.Event(
                        pygame.MOUSEMOTION,
                        pos=_mouse_pos, rel=(0, 0), buttons=tuple(_mouse_buttons[:3])
                    ))
                elif t == 'mousedown':
                    pygame.event.post(pygame.event.Event(
                        pygame.MOUSEBUTTONDOWN,
                        pos=_mouse_pos, button=button
                    ))
                elif t == 'mouseup':
                    pygame.event.post(pygame.event.Event(
                        pygame.MOUSEBUTTONUP,
                        pos=_mouse_pos, button=button
                    ))
            elif t == 'keydown':
                k = _resolve_key(d.get('code', ''), d.get('char', ''))
                pygame.event.post(pygame.event.Event(
                    pygame.KEYDOWN, key=k, mod=0,
                    unicode=d.get('char', '')
                ))
            elif t == 'keyup':
                k = _resolve_key(d.get('code', ''), d.get('char', ''))
                pygame.event.post(pygame.event.Event(
                    pygame.KEYUP, key=k, mod=0
                ))
        except Exception:
            pass

def _patch_events():
    """Intercept event.get() and event.pump() so input arrives in student's loop."""
    _orig_get  = pygame.event.get
    _orig_pump = pygame.event.pump
    _orig_mouse_set_pos = pygame.mouse.set_pos

    def _get(*args, **kwargs):
        _pump_input()
        return _orig_get(*args, **kwargs)

    def _pump():
        _pump_input()
        _orig_pump()

    def _get_pos():
        return _mouse_pos

    def _get_pressed(*args):
        requested = args[0] if args else 3
        if not isinstance(requested, int) or requested < 0:
            requested = 3
        return tuple(_mouse_buttons[:requested])

    def _set_pos(*args):
        global _mouse_pos
        if len(args) == 1 and isinstance(args[0], (tuple, list)):
            x, y = args[0]
        elif len(args) >= 2:
            x, y = args[0], args[1]
        else:
            return None

        _mouse_pos = (int(x), int(y))
        try:
            return _orig_mouse_set_pos(*args)
        except Exception:
            return None

    pygame.event.get  = _get
    pygame.event.pump = _pump
    pygame.mouse.get_pos = _get_pos
    pygame.mouse.get_pressed = _get_pressed
    pygame.mouse.set_pos = _set_pos

# ── Bootstrap & run student code ────────────────────────────────

def main():
    global _screen, _running

    student_file = sys.argv[1] if len(sys.argv) > 1 else '/tmp/main.py'

    # Init pygame (offscreen — no window created)
    pygame.init()
    _screen = pygame.display.set_mode(DEFAULT_SIZE)

    # Apply patches before student code loads
    _patch_pygame()
    _patch_events()

    print(f'[runner] Loading {student_file}', flush=True)

    with open(student_file, 'r') as f:
        src = f.read()

    ns = {
        '__name__': '__main__',
        '__file__': student_file,
    }

    try:
        exec(compile(src, student_file, 'exec'), ns)
    except SystemExit:
        pass
    except Exception:
        traceback.print_exc()
    finally:
        _running = False
        pygame.display.quit()
        if _orig_pygame_quit is not None:
            _orig_pygame_quit()
        print('[runner] exited', flush=True)

if __name__ == '__main__':
    main()
