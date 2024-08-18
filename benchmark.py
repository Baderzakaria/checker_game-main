from checker_model import CheckerModel
import tqdm

number_games_to_test = 10_00
wins_player_1 = 0
wins_player_2 = 0


for _ in tqdm.tqdm(range(number_games_to_test)):
	checker_model_object = CheckerModel()

	while True:
		checker_model_object.ia_move(model="random")
		game_state = checker_model_object.check_game_state()
		if game_state == "draw_game":
			break
		
		elif game_state == 1:
			wins_player_1 +=1
			break


		checker_model_object.ia_move(model="minimax")
		game_state = checker_model_object.check_game_state()
		if game_state == "draw_game":
			break
		
		elif game_state == -1:
			wins_player_2 +=1
			break


print(f"player 1  wins {wins_player_1}")
print(f"player 2  wins {wins_player_2}")
print(f"draws {number_games_to_test - wins_player_1 - wins_player_2}")