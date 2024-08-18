import pygame
"""
###
	Backend config
###
"""
ROWS = 6
COLS = ROWS
FILLED_ROWS = 1



"""
###
	Frontend config
###
"""
### Board display
BOARD_HEIGHT = 800
BOARD_WIDTH = 800

SQUARE_SIZE = BOARD_HEIGHT // ROWS
PIECE_RADIUS = SQUARE_SIZE // 2 - 8

CROWN_SIZE = (SQUARE_SIZE - 30, SQUARE_SIZE - 30)
CROWN = pygame.transform.scale(pygame.image.load('assets/crown.png'), CROWN_SIZE)


### Menu display
MENU_HEIGHT = 800
MENU_WIDTH = 130
MENU_POSITION = (BOARD_WIDTH, 0)

BUTTON_SIZE = (80, 30)
FONT_SIZE = 30
UNDO_BUTTON_POSITION = (BOARD_WIDTH + (MENU_WIDTH - BUTTON_SIZE[0]) // 2, (MENU_HEIGHT - BUTTON_SIZE[1])// 2)



### Window display
WINDOW_HEIGHT = BOARD_HEIGHT
WINDOW_WIDTH = BOARD_WIDTH + MENU_WIDTH

FPS = 60





### Colors

OFF_WHITE = (245, 242, 208)
BROWN = (88, 57, 39)

WHITE = (255, 255, 255)
BLACK = (0, 0 ,0)
GRAY = (100, 100, 100)

RED = (255, 0, 0)
BLUE = (0, 0, 255)
GREEN = (0, 255, 0)