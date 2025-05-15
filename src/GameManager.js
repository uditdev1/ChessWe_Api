import { 
    INIT_GAME, MESSAGE, MOVE, SPECTARE , 
    INIT_SPECTING, GAMES_COUNT, OPPONENT_DISCONNECT, 
    STREAM_OVER, CHANNEL_EXIST, GAME_NOT_FOUND , 
    MESSAGEALL, OFFER, ANSWER, ICE_CANDIDATE, 
    START_CALL_SENDER, CALL_STARTED, START_CALL_START_TIMER, 
    START_CALL_RECEIVER, END_CALL,
    HELP_RECEIVED,
    ASK_FOR_HELP,
    GAMEPLAY_TIPS
} from "./Messages.js";
import { Game } from "./Game.js";
import Gemini from "gemini-ai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export class GameManager {
    #games; 
    #pendingUser;
    #channelPending;
    #currChannelsSet
    #users;
    #bet_games
    tips;
    constructor() {
        this.#games = []; 
        this.#pendingUser = null;
        this.#channelPending = [];
        this.#currChannelsSet = new Set([]);
        this.#users = [];
        this.tips = [];
        this.#bet_games = new Map([
            [0.1, null],
            [0.2, null],
            [0.5, null],
            [1, null]
        ]);
        
    }

    addUser(socket) {
        this.#users.push(socket);
        this.#addHandler(socket);
        setTimeout( () => {
            this.sendGameCount();
        } , 2000);
    }

    removeUser(socket) {
        this.#users = this.#users.filter(user => user !== socket);
        if(this.#pendingUser === socket){
            this.#pendingUser = null;
            return;
        }
        const currGame = this.#games.filter(game => game.player1 === socket || game.player2 === socket )[0];
        if(currGame){
            
            this.#currChannelsSet.delete(currGame.channelNumber);

            const message = JSON.stringify({
                type : OPPONENT_DISCONNECT
            });
            if(currGame.player1 == socket){
                currGame.player2.send(message);
            } else {
                currGame.player1.send(message);
            }
            if(currGame.spectares && !currGame.board.isGameOver()){
                const winner = "User Disconnected" ;
                currGame.spectares.map( (spectare) => {
                    spectare.send(JSON.stringify({
                        type : STREAM_OVER,
                        payload : {
                            winner : winner
                        }
                    }))
                })
            }
        }

        this.#games = this.#games.filter(game => game.player1 !== socket && game.player2 !== socket );
        this.sendGameCount();
    }

    sendGameCount(){
        this.#users.map( ( user) => {
            user.send(JSON.stringify({
                type : GAMES_COUNT,
                games_count : this.#games.length,
                users_count : this.#users.length
            }))
        })
    }

    #addHandler(socket) {
        socket.on('message', async (data) => {
            const message = JSON.parse(data.toString());
            if(message.type === INIT_GAME && message.channel > 0){

                if(this.#currChannelsSet.has(message.channel)){
                    socket.send(JSON.stringify({
                        type : CHANNEL_EXIST,
                    }));
                    return;
                }

                const waitingUser = this.#channelPending.filter((channel) => channel.channelNumber === message.channel)[0];

                if(waitingUser){
                    const game = new Game(waitingUser.userSocket , socket, message.channel);
                    this.#games.push(game);
                    this.sendGameCount();
                    this.#channelPending = this.#channelPending.filter((channel) => channel.channelNumber !== message.channel);
                    this.#currChannelsSet.add(message.channel);
                } else {
                    this.#channelPending.push({userSocket : socket , channelNumber : message.channel});
                }
            } else if(message.type === INIT_GAME && message.bet_game) {
                if(!this.#bet_games[message.bet_amount]){
                    this.#bet_games[message.bet_amount] = socket;
                } else {
                    console.log(this.#bet_games[message.bet_amount]);
                    const game = new Game(this.#bet_games[message.bet_amount] , socket, null);
                    this.#games.push(game);
                    this.sendGameCount();
                    this.#bet_games[message.bet_amount] = null;
                }
            } else if (message.type === INIT_GAME) {
                if (this.#pendingUser ) {
                    const game = new Game(this.#pendingUser, socket, null);
                    this.#games.push(game);
                    this.sendGameCount();
                    this.#pendingUser = null;
                } else {
                    this.#pendingUser = socket;
                }
            }

            if(message.type === INIT_SPECTING){
                if(this.#games.length > 0){
                    if(message.channelNumber > 0){
                        const spectingGame = this.#games.filter( (game ) => game.channelNumber == message.channelNumber)[0];
                        if(spectingGame){
                            spectingGame.addSpectare(socket);
                        } else {
                            socket.send(JSON.stringify({
                                type : GAME_NOT_FOUND,
                            }))
                        }
                    } else {
                        const spectingGame = this.#games[
                            this.#games.length > message.index ? message.index : 0
                        ];
                        spectingGame.addSpectare(socket);
                    }
                } else {
                    console.log("game not found");
                }
            }

            if (message.type === MOVE) {
                const game = this.#games.find(game => game.player1 === socket || game.player2 === socket);
                if (game) {
                    game.makeMove(socket, message.payload.move);

                    const gemini = new Gemini(process.env.API_GEMINI_AI,  {
                        model: "gemini-1.5-pro-latest",
                    });
                    const getMoveFor = `You are playing a chess game as the competitor against another player. 
                        It's your turn to make the best possible valid chess move.

                        Here is the current game state in FEN format: ${JSON.stringify(game.board.fen())}.
                        Here is the board array representation: ${JSON.stringify(game.board.board())}.

                        respond using this schema :
                        move : {
                            form : string , // Starting square in algebraic notation (e.g., "e2").
                            to : string // Destination square in algebraic notation (e.g., "e4").
                        };
                        Return move;
                    `
                    const response = await gemini.ask(getMoveFor);
                    
                    try {
                        const cleanedResponse = response.replace(/```json|```/g, '').trim();
                        const parsedResponse = JSON.parse(cleanedResponse);
                        const move = parsedResponse.move;
                        if (move && move.from && move.to) {
                            game.player1.send(JSON.stringify({
                                type : "ai_move",
                                payload : {
                                    move
                                }
                            }));
                            game.player2.send(JSON.stringify({
                                type : "ai_move",
                                payload : {
                                    move
                                }
                            }));
                            
                        } else {
                            console.error("Invalid move format in the response.");
                        }
                    } catch (error) {
                        console.error("Failed to parse response:", error.message);
                        console.error("Raw response:", response);
                    }

                } else {
                    console.log('Game not found for move:', message.payload.move);
                }
            }

            if(message.type === MESSAGE){
                const game1 = this.#games.find(game => game.player1 === socket );
                const game2 = this.#games.find(game => game.player2 === socket );
                if (game1) {
                    game1.sendMessage( message.message, game1.player1);
                } else if (game2) {
                    game2.sendMessage( message.message, game2.player2);
                } else {
                    console.log('Game not found for move:');
                }
            }

            if(message.type === 'recording_started'){
                console.log("game manager recording received !");
                const game = this.#games.find(game => game.player1 === socket || game.player2 === socket);
                if(game){
                    game.startRecording();
                }
            }
            if(message.type === MESSAGEALL){
                this.#users.map((user) => {
                    user.send(JSON.stringify({
                        type : MESSAGEALL,
                        message : message.message ,
                        owner : user === socket ? "sender" : "receiver" ,
                    }))
                })
            }
            if(message.type === OFFER || message.type === ANSWER || message.type === ICE_CANDIDATE){
                const game1 = this.#games.find(game => game.player1 === socket );
                const game2 = this.#games.find(game => game.player2 === socket );
                if (game1) {
                    game1.player2.send(data);
                } else if (game2) {
                    game2.player1.send(data);
                } else {
                    console.log('Game not found for move:');
                }
            }
            if(message.type == START_CALL_SENDER){
                const game1 = this.#games.find(game => game.player1 === socket );
                const game2 = this.#games.find(game => game.player2 === socket );
                if (game1) {
                    game1.player1WantsCall = true;
                    if(game1.player1WantsCall && game1.player2WantsCall){
                        game1.player2.send(
                            JSON.stringify({
                                type: CALL_STARTED,
                            })
                        );
                        game1.player1.send(
                            JSON.stringify({
                                type: START_CALL_START_TIMER,
                            })
                        );
                    } else {
                        game1.player2.send(
                            JSON.stringify({
                                type: START_CALL_RECEIVER,
                            })
                        );
                    }
                } else if (game2) {
                    game2.player2WantsCall = true;
                    if(game2.player1WantsCall && game2.player2WantsCall){
                        game2.player1.send(
                            JSON.stringify({
                                type:CALL_STARTED,
                            })
                        );
                        game2.player2.send(
                            JSON.stringify({
                                type: START_CALL_START_TIMER,
                            })
                        );
                    } else {
                        game2.player1.send(
                            JSON.stringify({
                                type: START_CALL_RECEIVER,
                            })
                        );
                    }
                } else {
                    console.log('Game not found for move:');
                }
            }
            if(message.type === END_CALL){
                const game = this.#games.find(game => game.player1 === socket || game.player2 === socket );
                game.player1WantsCall = false;
                game.player2WantsCall = false;
                game.player1.send(
                    JSON.stringify({
                        type : END_CALL
                    })
                );
                game.player2.send(
                    JSON.stringify({
                        type : END_CALL
                    })
                );
            }
            if(message.type === ASK_FOR_HELP){

                const getSquareRepresentation = (i, j, reverse) => {
                    const charRow = String.fromCharCode(97 + (j % 8));
                    const intCol = 8 - i; 
                    return reverse ? `${String.fromCharCode(97 + (7 - j % 8))}${1 + i}` : `${charRow}${intCol}`;
                };
                for (let row = 0; row < message.board.length; row++) {
                    for (let col = 0; col < message.board[row].length; col++) {
                        if(message.board[row][col] === null){
                            message.board[row][col] = {
                                square : getSquareRepresentation(row, col, false),
                                type : null
                            };
                        } 
                    }
                }

                const chess_str = JSON.stringify(message.board, null , 2);
                const fen_coordinates = "a8b8c8d8e8f8g8h8/a7b7c7d7e7f7g7h7/a6b6c6d6e6f6g6h6/a5b5c5d5e5f5g5h5/a4b4c4d4e4f4g4h4/a3b3c3d3e3f3g3h3/a2b2c2d2e2f2g2h2/a1b1c1d1e1f1g1h1"
                try {
                    const gemini = new Gemini(process.env.API_GEMINI_AI,  {
                        model: "gemini-v2",
                    });

                    const getMoveFor = `Hi Gemini,

                    I need your assistance in analyzing a chess position and suggesting the best legal move based on the current board state.
                    
                    Here is the **FEN notation** of the chessboard:
                    ${message.fen}
                    
                    Additionally, I am providing the board state in two formats to help you understand the position:
                    
                    1. **Chessboard Array** (array of arrays, each representing a row of the board):
                    ${chess_str}
                    
                    2. **FEN Coordinates** (representing the layout of the fen and board in a compact form):
                    ${fen_coordinates}            

                    ### Task:
                    Please analyze the provided board position and suggest the best legal move.
                    
                    ### Instructions:
                    1. **Return only the move** in the format: "square to square" (e.g., "e2 to e4").
                       - Each square is denoted by standard chess notation (e.g., "a1", "e4", "h8").
                       - Do **not** include any additional explanations or information.
                    2. **Assume** the move you provide is the best legal move according to standard chess rules, considering things like:
                       - Piece movement rules (e.g., pawn, knight, bishop, rook, queen, king).
                       - Legal capture moves.
                       - Castling and en passant if applicable.
                       - Check and checkmate situations.
                    3. If a square is empty in the **chessboard array**, its type will be denoted as null.
                    4. Use your understanding of chess to suggest the most optimal move based on the given position.
                    
                    Please provide only the move in the specified format.`

                    const response = await gemini.ask(getMoveFor);
                    socket.send(JSON.stringify({
                        type : HELP_RECEIVED,
                        message : response
                    }));
                } catch (err) {
                    console.log(err.message);
                    socket.send(JSON.stringify({
                        type : HELP_RECEIVED,
                        message : err.message
                    }));
                }
            }
            if(message.type === GAMEPLAY_TIPS){
                const getMoveFor =`Hi Gemini,

                Provide a unique chess gameplay tip in 5 to 10 words, focusing on strategy, tactics, or mindset. Ensure each tip is different from those already listed below:
                
                ${this.tips}
                Avoid repeating any of the tips provided above. Prioritize originality and precision in your response.
                `

                try {
                    const gemini = new Gemini(process.env.API_GEMINI_AI,  {
                        model: "gemini-1.5-pro-latest",
                    });
                    const response = await gemini.ask(getMoveFor);
                    this.tips.push(response);
                    if(this.tips.length > 5){
                        this.tips = [];
                    }
                    socket.send(JSON.stringify({
                        type : GAMEPLAY_TIPS,
                        message : response
                    }));
                } catch (err ){
                    socket.send(JSON.stringify({
                        type : GAMEPLAY_TIPS,
                        message : err.message
                    }))
                }
            }
              
        });
    }
}