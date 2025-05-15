import { WebSocket } from "ws";
import { Chess } from "chess.js";
import { GAME_OVER, INIT_GAME, MESSAGE, MOVE, SPECTARE, INIT_SPECTING, STREAM_OVER, SPECTARE_CONNECTED } from "./Messages.js";

export class Game {
    player1;
    player2;
    spectares;
    channelNumber
    board;
    recording
    #moveCount;
    #startTime;
    #player1WantsCall
    #player2WantsCall
    
    constructor(player1, player2, channelNumber) {
        this.player1 = player1;
        this.player2 = player2;
        this.#player1WantsCall = false;
        this.#player2WantsCall = false;
        this.spectares = [];
        this.channelNumber = channelNumber;
        this.board = new Chess();
        this.#moveCount = 0;
        this.#startTime = new Date();
        this.recording = false;
        this.player1.send(JSON.stringify({
            type: INIT_GAME,
            payload : {
                color: "white",
            },
        }));
        this.player2.send(JSON.stringify({
            type: INIT_GAME,
            payload : {
                color : "black",
            },
        }));
    }

    makeMove(socket, move) {
        if (this.#moveCount % 2 === 0 && socket !== this.player1) {
            return;
        }

        if (this.#moveCount % 2 === 1 && socket !== this.player2) {
            return;
        }

        try {
            this.board.move(move);
        } catch (e) {
            console.error("error " , e);
            return;
        }

        if (this.board.isGameOver()) {
            const winner = this.board.turn() === 'w' ? "black" : "white";
            const message = JSON.stringify({
                type: GAME_OVER,
                payload: {
                    winner: winner
                }
            });
            this.player1.send(message);
            this.player2.send(message);
            this.spectares.map( ( spectare ) => {
                spectare.send(JSON.stringify({
                    type: STREAM_OVER,
                    payload: {
                        winner: winner
                    }
                }))
            })
            return;
        }

        if(this.#moveCount %2 === 0) {
            this.player2.send(JSON.stringify({
                type: MOVE,
                payload : move,
                moveCount : this.#moveCount
            }));
            this.player1.send(JSON.stringify({moveCount : this.#moveCount}));
        } else {
            this.player1.send(JSON.stringify({
                type:MOVE,
                payload : move,
                moveCount : this.#moveCount
            }));
            this.player2.send(JSON.stringify({moveCount : this.#moveCount}))
        }

        const spectareMessage = JSON.stringify( {
            type : SPECTARE,
            message : this.board.board(),
            payload : move, 
            moveCount : this.#moveCount
        });
        const spectareMessageMove = JSON.stringify( {
            type : MESSAGE,
            message :"From : " + move.from + " , " + "To : " + move.to ,
            owner : "sender"
        });
        if(this.recording) console.log("recording " , move);
        this.spectares.map( (spectare) => {
            spectare.send(spectareMessage)
            spectare.send(spectareMessageMove)
        });

        this.#moveCount++;
    }
    sendMessage( messageToSend, player) {
        const message1 = JSON.stringify({
            type: MESSAGE,
            message : messageToSend,
            owner : player === this.player1 ? "sender" : "receiver"
        });
        const message2 = JSON.stringify({
            type: MESSAGE,
            message : messageToSend,
            owner : player === this.player2 ? "sender" : "receiver"
        });
        
        this.player1.send(message1);
        this.player2.send(message2);
    }

    addSpectare(socket){
        this.spectares.push(socket);
        const spectareMessage = JSON.stringify( {
            type : INIT_SPECTING,
            moveCount : this.#moveCount,
            message : this.board.board(),
            channelNumber : this.channelNumber
        });
        socket.send(spectareMessage);
        const spectareConnected = JSON.stringify({
            type : SPECTARE_CONNECTED,
        });
        this.player1.send(spectareConnected);
        this.player2.send(spectareConnected);
    }

    startRecording(){
        this.recording = true;
        console.log("recording started !");
    }
}