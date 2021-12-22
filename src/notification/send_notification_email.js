const nodemailer = require('nodemailer');

const mail_messages = {};

module.exports = function (config, notify, host, check_command, state, message, callback){
  //REOCCURRING
  if(mail_messages[host.name]){
    if(mail_messages[host.name][check_command.unique_name]){

        mail_messages[host.name][check_command.unique_name].lastOccurring = Date.now();

        if(((Date.now() - mail_messages[host.name][check_command.unique_name].lastNotification) >= 60000*config.reoccurring_error_message_time && state == 'error') || ((Date.now() - mail_messages[host.name][check_command.unique_name].lastNotification) >= 60000*config.reoccurring_warning_message_time && state == 'warning') || mail_messages[host.name][check_command.unique_name].lastState !== state){
          mail_messages[host.name][check_command.unique_name].lastNotification = Date.now();

          send_email(config, notify, host, check_command, 'REOCCURRING', state, message, mail_messages[host.name][check_command.unique_name], ()=>{
            if(state === 'ok'){
              mail_messages[host.name][check_command.unique_name] = undefined;
            }else{
              mail_messages[host.name][check_command.unique_name].lastState = state;
            }

            callback();
          });
        }

        callback();
        return;
    }
  }else{
    mail_messages[host.name] = {};
  }

  //FIRST
  if(state !== 'ok'){
    mail_messages[host.name][check_command.unique_name] = {lastState: state, firstOccurring: Date.now(), lastOccurring: Date.now(), lastNotification: Date.now()};

    send_email(config, notify, host, check_command, 'NEW', state, message, mail_messages[host.name][check_command.unique_name], callback);
  }else{
    callback();
  }
}

var transporter = undefined;

function send_email(config, notify, host, check_command, type, state, message, timestamps, callback){
  if(!transporter){
    transporter = nodemailer.createTransport(config.mail);
  }

  var timestampText = 'First occurred: ' + timeConverter(timestamps.firstOccurring) + '\nLast occurred: ' + timeConverter(timestamps.lastOccurring);
  var subject = '[' + type + '] ' + state + ' while checking command ' + check_command.command_name;
  var text = '';

  if(message){
    text = check_command.unique_name + ' returned ' + state + ' on ' + host.name + '\n \n' + message + '\n' + timestampText;
  }else{
    text = check_command.unique_name + ' is now ' + state + ' on ' + host.name + '\n' + timestampText;
  }

  transporter.sendMail({
    from: config.mail.from,
    to: notify.vars.email,
    subject: subject,
    text: text
  }, (message, info)=>{
    if(error){
      console.log(error);
    }


  });

  callback();
}

function timeConverter(UNIX_timestamp){
  var a = new Date(UNIX_timestamp);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var year = a.getFullYear();
  var month = months[a.getMonth()];
  var date = a.getDate();
  var hour = a.getHours();
  var min = a.getMinutes();
  var sec = a.getSeconds();
  var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;
  return time;
}
