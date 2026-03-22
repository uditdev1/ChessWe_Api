import dotenv from "dotenv";
dotenv.config();
import { WebSocketServer } from 'ws';
import { GameManager } from './GameManager.js';
import {sendMail} from '../helper/mailer.js';
import { msg } from "./utils/emailData.js";
const wss = new WebSocketServer({ port: 8080 });

const gameManager = new GameManager();
console.log("WebSocket server started on port 8080");
wss.on('connection', function connection(ws) {

  // sendMail(process.env.SEND_MAIL_TO, "ChessWe user connected", msg);
  console.log("user connected");
  gameManager.addUser(ws);

  ws.on('close' , () => {
    console.log("disconnected user socket! ");
    gameManager.removeUser(ws);
  });

});