from itertools import product
from config_file import *
from utils import is_in_bound

class Piece:
	def __init__(self, row, col, player):
		self.row = row
		self.col = col 
		self.player = player

		self.king = False

	def become_king(self):
		self.king = True

	def get_cells_to_check(self):
		if not self.king:
			cells_to_check = product([self.row - 1, self.row + 1], [self.col-1, self.col+1])
		
		else:
			diagonal = [(self.row + i, self.col + i) for i in range(-ROWS, ROWS + 1) if is_in_bound(self.row + i, self.col + i)]
			antidiagonal = [(self.row + i, self.col - i) for i in range(-ROWS, ROWS + 1) if is_in_bound(self.row + i, self.col - i)]
			cells_to_check = diagonal + antidiagonal
		
		return cells_to_check


	def __repr__(self):
		return f"King {1 if self.player == 1 else 2}" if self.king else f"Piece {1 if self.player == 1 else 2}"