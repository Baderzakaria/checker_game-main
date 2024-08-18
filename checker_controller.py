import checker_model, checker_view


from config_file import *



import pygame

class CheckerController:
	# connexion backend / frontend
	def __init__(self, checker_grid):
		self.checker_model_object = checker_model.CheckerModel(checker_grid)
		self.checker_view_object = checker_view.CheckerView()
		self.run_game()



	def selected_piece(self, x, y):
		selected_piece = checker_view.CheckerView.compute_row_col_of_selected_piece(x, y)
		possible_moves_positions = []

		if selected_piece in self.checker_model_object.dict_of_possible_moves.keys():
			possible_moves_positions = [move_object.get_final_position()\
										for move_object in self.checker_model_object.dict_of_possible_moves[selected_piece]]

		return selected_piece, possible_moves_positions


	def action_on_grid(self, selected_piece, possible_moves_positions, event):
		if event.type == pygame.MOUSEBUTTONDOWN:
			clicked_position = pygame.mouse.get_pos()

			if not selected_piece or not possible_moves_positions:
				selected_piece, possible_moves_positions = self.selected_piece(*clicked_position)


			elif selected_piece and possible_moves_positions:
				move = checker_view.CheckerView.compute_row_col_of_selected_piece(*clicked_position)
				
				if move in possible_moves_positions: # quand la personne clique sur un point vert
					self.checker_model_object.move_piece(selected_piece, move)
					self.checker_model_object.ia_move(model="minimax")
					
					selected_piece = None
					possible_moves_positions = []
				
				else: # quand la personne veut changer la pièce selectionnée:
					selected_piece, possible_moves_positions = self.selected_piece(*clicked_position)

		return selected_piece, possible_moves_positions


	def undo_action(self, event):

		if event.type == pygame.MOUSEBUTTONDOWN and pygame.Rect(*UNDO_BUTTON_POSITION, *BUTTON_SIZE).collidepoint(event.pos):
			self.checker_model_object.undo_last_action()


	def run_game(self):

		run = True
		clock = pygame.time.Clock()

		selected_piece = None
		possible_moves_positions = []

		while run:

			clock.tick(FPS)

			for event in pygame.event.get():
				if event.type == pygame.QUIT:
					run = False
				

				selected_piece, possible_moves_positions = self.action_on_grid(selected_piece, possible_moves_positions, event)
				self.undo_action(event)



			self.checker_view_object.update_grid(self.checker_model_object.checker_grid)

			if selected_piece and possible_moves_positions:
				self.checker_view_object.show_possible_moves_positions(selected_piece, possible_moves_positions)

			pygame.display.update()

		pygame.quit()