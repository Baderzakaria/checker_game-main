from config_file import *

def is_in_bound(row, col):
	return row >=0 and row < ROWS and col >= 0 and col < COLS