from config_file import *
from piece import Piece
import pygame


class CheckerView:
	# implémentation du front-end
	def __init__(self):
		pygame.init()
		self.window = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
		pygame.display.set_caption('Checker !')



	def draw_board(self):
		pygame.draw.rect(self.window, OFF_WHITE, (0, 0, BOARD_WIDTH, BOARD_HEIGHT))
		for row in range(0, ROWS):
			for col in range(0, COLS):
				if (row + col) % 2 != 0:
					pygame.draw.rect(self.window, BROWN, (col*SQUARE_SIZE, row*SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE))



	def draw_pieces(self, checker_grid):
		for row in range(0, ROWS):
			for col in range(0, COLS):
				if type(checker_grid[row][col]) == Piece:
					current_piece = checker_grid[row][col]
					
					piece_position = CheckerView.compute_piece_position_on_window(row, col)
					
					if current_piece.player == 1:
						pygame.draw.circle(self.window, BLACK, piece_position, PIECE_RADIUS+4)
						pygame.draw.circle(self.window, WHITE, piece_position, PIECE_RADIUS)

					elif current_piece.player == -1:
						pygame.draw.circle(self.window, WHITE, piece_position, PIECE_RADIUS+2)
						pygame.draw.circle(self.window, BLACK, piece_position, PIECE_RADIUS)

					if current_piece.king:
						crown_position = (col*SQUARE_SIZE + PIECE_RADIUS//2, row*SQUARE_SIZE + PIECE_RADIUS//2)
						self.window.blit(CROWN, crown_position)




	def draw_undo_button(self):
		# Dessiner le boutton
		button_rect = pygame.Rect(*UNDO_BUTTON_POSITION, *BUTTON_SIZE)
		
		button_color = BLUE if button_rect.collidepoint(pygame.mouse.get_pos()) else RED # gérer le hover
		pygame.draw.rect(self.window, button_color, button_rect)

		undo_text = pygame.font.Font(None, FONT_SIZE).render('Undo', True, WHITE)
		self.window.blit(undo_text, (button_rect.x + BUTTON_SIZE[0]//5, button_rect.y + BUTTON_SIZE[1]//4))




	def draw_menu(self):
		pygame.draw.rect(self.window, GRAY,(*MENU_POSITION, MENU_WIDTH, MENU_HEIGHT))
		pygame.draw.line(self.window, BLACK, start_pos=(BOARD_WIDTH, 0), end_pos=(BOARD_WIDTH, BOARD_HEIGHT), width=5)
		
		self.draw_undo_button()



	def update_grid(self, checker_grid):
		self.draw_board()
		self.draw_pieces(checker_grid)
		self.draw_menu()



	def show_possible_moves_positions(self, selected_piece, possible_moves):
		selected_piece_position = CheckerView.compute_piece_position_on_window(*selected_piece)
		pygame.draw.circle(self.window, BLUE, selected_piece_position, 5)


		for possible_move in possible_moves:
			possible_move_position = CheckerView.compute_piece_position_on_window(*possible_move)
			pygame.draw.circle(self.window, GREEN, possible_move_position, 5)


	@staticmethod
	def compute_piece_position_on_window(row, col):
		x = SQUARE_SIZE * col + SQUARE_SIZE // 2
		y = SQUARE_SIZE * row + SQUARE_SIZE // 2
		return x, y


	@staticmethod
	def compute_row_col_of_selected_piece(x, y):
		row = y // SQUARE_SIZE
		col = x // SQUARE_SIZE
		return row, col