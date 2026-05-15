import pygame
import sys

pygame.init()
screen = pygame.display.set_mode((800, 600))
pygame.display.set_caption("Viewer Stability Test")
clock = pygame.time.Clock()

x = 100
direction = 1
running = True
frames = 0

print("pygame started", flush=True)

while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    x += 4 * direction
    if x >= 700 or x <= 100:
        direction *= -1
        print(f"bounce at x={x}", flush=True)

    screen.fill((18, 38, 58))
    pygame.draw.circle(screen, (255, 210, 80), (x, 300), 50)
    pygame.draw.rect(screen, (90, 170, 255), (280, 120, 240, 70))
    pygame.display.flip()
    clock.tick(60)

    frames += 1
    if frames % 300 == 0:
        print(f"heartbeat frames={frames}", flush=True)

print("pygame exiting", flush=True)
pygame.quit()
sys.exit(0)