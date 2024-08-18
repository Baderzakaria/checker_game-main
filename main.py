import checker_controller
from config_file import *

import numpy
from piece import Piece
import numpy

if __name__ == "__main__":
	#case 0 :
	checker_grid = None


	# checker_grid = [[numpy.nan if (row + col) % 2 == 0 else 0 for col in range(0, COLS)] for row in range(0, ROWS)] 
	#case 1
	# checker_grid[0][5] = Piece(0, 5, 1)
	# checker_grid[0][5].become_king()
	# checker_grid[2][3] = Piece(2, 3, -1)
	# checker_grid[4][1] = Piece(4, 1, -1)
	# checker_grid[6][5] = Piece(6, 5, -1)

	#case 2
	# checker_grid[9][0] = Piece(9, 0, 1)
	# checker_grid[8][1] = Piece(8, 1, -1)
	# checker_grid[6][3] = Piece(6, 3, -1)
	# checker_grid[8][3] = Piece(8, 3, -1)


	#case 3

	# checker_grid[0][1] = Piece(0, 1, 1)
	# checker_grid[0][1].become_king()
	# checker_grid[1][2] = Piece(1, 2, -1)
	# checker_grid[2][3] = Piece(2, 3, -1)
	# checker_grid[3][4] = Piece(3, 4, -1)


	#case 4 

	checker_controller_object = checker_controller.CheckerController(checker_grid=checker_grid)