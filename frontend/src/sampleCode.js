export const sampleCode = `import sys
import time

import pygame


WINDOW_WIDTH = 800
WINDOW_HEIGHT = 600
BACKGROUND_COLOR = (18, 38, 58)
SHAPE_COLOR = (255, 196, 61)
TEXT_COLOR = (230, 238, 245)
FPS = 60
HEARTBEAT_INTERVAL_SECONDS = 5


def main() -> int:
    pygame.init()
    pygame.display.set_caption("Pygame POC Smoke Test")
    screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
    clock = pygame.time.Clock()
    font = pygame.font.SysFont(None, 32)

    print("sample: pygame initialized", flush=True)
    print(
        f"sample: window created at {WINDOW_WIDTH}x{WINDOW_HEIGHT}",
        flush=True,
    )
    print("sample: waiting for Stop or window close", flush=True)

    start_time = time.time()
    next_heartbeat = start_time
    rect_y = WINDOW_HEIGHT // 2 - 25
    rect_speed = 220
    running = True
    quit_reason = "window_closed"

    while running:
        now = time.time()
        elapsed = now - start_time

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                quit_reason = "window_closed"
                running = False

        if now >= next_heartbeat:
            print(f"sample: heartbeat {elapsed:.1f}s", flush=True)
            next_heartbeat += HEARTBEAT_INTERVAL_SECONDS

        rect_x = int((elapsed * rect_speed) % (WINDOW_WIDTH + 80)) - 40

        screen.fill(BACKGROUND_COLOR)
        pygame.draw.circle(screen, (81, 150, 244), (120, 120), 48)
        pygame.draw.rect(screen, SHAPE_COLOR, pygame.Rect(rect_x, rect_y, 80, 50))

        label = font.render("Default sample stays live until Stop", True, TEXT_COLOR)
        timer = font.render(
            f"Elapsed: {elapsed:0.1f}s",
            True,
            TEXT_COLOR,
        )
        screen.blit(label, (24, 24))
        screen.blit(timer, (24, 64))
        pygame.display.flip()
        clock.tick(FPS)

    print(f"sample: exiting cleanly ({quit_reason})", flush=True)
    pygame.quit()
    return 0


if __name__ == "__main__":
    sys.exit(main())
`;
