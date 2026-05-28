#Bounce Ball - Gain points by clicking the ball
import sys, pygame
import random

# Variable setup
size = width, height = 1200, 800
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
WHITE = (255,255,255)
AQUA = (0,255,255)
YELLOW = (255,255,0)
RED = (255,0,0)
GREEN = (0,255,0)
score = 0
bgColor = WHITE
pace = 1
speed = [pace, pace]

#Blocks
def drawScore(score):    
    scoreSurf = font.render('Points: %s' % (score), True, BLACK)
    scoreRect = scoreSurf.get_rect()
    scoreRect.topleft = (width - 120, 10)
    screen.blit(scoreSurf, scoreRect)

#Initialize Pygame and create window
pygame.init()
pygame.display.set_caption('Bounce Ball')
font = pygame.font.Font('freesansbold.ttf', 18)
ball = pygame.image.load("bounce_ball.png")
ballrect = ball.get_rect()
screen = pygame.display.set_mode(size)

#-----------------------------------Students to type this section---------------------------#

#Main Game Loop
running = True
while running:
    #check for events
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        if event.type == pygame.MOUSEBUTTONDOWN:
            x,y = pygame.mouse.get_pos()
            if ballrect.collidepoint(x,y):
                bgColor = random.choice([WHITE, AQUA, YELLOW, RED, GREEN])                      #base program
                SOUND = pygame.mixer.Sound('buzzer.wav')                                        #Bronze Challenge
                SOUND.play()                                                                    #Bronze Challenge                
                score+=1                                                                        #Silver Challenge
                if score%5 == 0:                                                                #Gold Challenge
                    pace+=1                                                                     #Gold Challenge
                    speed = [pace, pace]                                                        #Gold Challenge

    #move ball
    ballrect = ballrect.move(speed)
    if ballrect.left < 0 or ballrect.right > width:
        speed[0] = -speed[0]
    if ballrect.top < 0 or ballrect.bottom > height:
        speed[1] = -speed[1]

    #display and refresh
    screen.fill(bgColor)
    screen.blit(ball, ballrect)
    drawScore(score)                                                                            #Silver Challenge
    pygame.display.flip()

#quit program
pygame.quit()

#-----------------------------------Students to type above section---------------------------#



#Challenges

#Bronze: Play sound everytime ball is clicked
#Silver: Show score; change score everytime the ball is clicked
#Gold: Increase speed of the ball after every 5 points
