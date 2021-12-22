const axios = require('axios');

const webhook_messages = {};

module.exports = function (config, notify, host, check_command, state, message, callback){
  //REOCCURRING
  if(webhook_messages[host.name]){
    if(webhook_messages[host.name][check_command.unique_name]){

        webhook_messages[host.name][check_command.unique_name].lastOccurring = Date.now();

        if(((Date.now() - webhook_messages[host.name][check_command.unique_name].lastNotification) >= 60000*config.reoccurring_error_message_time && state === 'error') || ((Date.now() - webhook_messages[host.name][check_command.unique_name].lastNotification) >= 60000*config.reoccurring_warning_message_time && state === 'warning') || webhook_messages[host.name][check_command.unique_name].lastState !== state){
          webhook_messages[host.name][check_command.unique_name].lastNotification = Date.now();

          execute_webhook(config, notify, host, check_command, 'REOCCURRING', state, message, webhook_messages[host.name][check_command.unique_name], ()=>{
            if(state === 'ok'){
              webhook_messages[host.name][check_command.unique_name] = undefined;
            }else{
              webhook_messages[host.name][check_command.unique_name].lastState = state;
            }

            callback();
          });
        }

        callback();
        return;
    }
  }else{
    webhook_messages[host.name] = {};
  }

  //FIRST
  if(state !== 'ok'){
    webhook_messages[host.name][check_command.unique_name] = {lastState: state, firstOccurring: Date.now(), lastOccurring: Date.now(), lastNotification: Date.now()};

    execute_webhook(config, notify, host, check_command, 'NEW', state, message, webhook_messages[host.name][check_command.unique_name], callback);
  }else{
    callback();
  }
}

function execute_webhook(config, notify, host, check_command, type, state, message, timestamps, callback){
  let timestampText = 'First occurred: ' + timeConverter(timestamps.firstOccurring) + '\n Last occurred: ' + timeConverter(timestamps.lastOccurring);
  let subject = '[' + type + '] ' + state + ' while checking command ' + check_command.command_name;
  let text = '';

  if(message){
    text = check_command.unique_name + ' returned ' + state + ' on ' + host.name + '\n \n' + message + '\n' + timestampText;
  }else{
    text = check_command.unique_name + ' is now ' + state + ' on ' + host.name + '\n' + timestampText;
  }

  axios.post(notify.vars.endpoint, { data: { subject: subject, text: text, type: type, state: state, message: message, timestamps: timestamps, hostname: host.name, command_name: check_command.unique_name}}).then( data => {
    console.log(data.data);
  }).catch(error => {
    console.log(error.message);
  });

  callback();
}

function timeConverter(UNIX_timestamp){
  let a = new Date(UNIX_timestamp);
  let months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let year = a.getFullYear();
  let month = months[a.getMonth()];
  let date = a.getDate();
  let hour = a.getHours();
  let min = a.getMinutes();
  let sec = a.getSeconds();

  return date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec;
}
