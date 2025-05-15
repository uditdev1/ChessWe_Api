import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
    host : process.env.SMTP_HOST,
    port : process.env.SMTP_PORT,
    secure : false,
    requireTLS : true,
    auth : {
        user : process.env.SMTP_MAIL,
        pass : process.env.SMTP_PASSWORD,
    }
});

export const sendMail = async (email, subject, content) => {
    try{
        var mailOptions = {
            from: process.env.SMTP_MAIL,
            to : email,
            subject : subject,
            html : content
        }
        transporter.sendMail(mailOptions, (err, info) => {
            if(err){
                console.log("mail sent error occured \n" , err.message);
            } else {
                console.log("Mail sent", info.messageId);
            }
        })
    }catch(err){
        console.log("last error " , err);
    }
}