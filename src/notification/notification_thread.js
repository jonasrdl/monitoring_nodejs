const send_notification_email = require('./send_notification_email.js');
const send_notification_influxdb = require('./send_notification_influxdb.js');
const send_notification_webhook = require('./send_notification_webhook.js');

var queue = {};
var index = {};

module.exports.thread = function(callback){
  var loop = function(){
    if(queue.influx.length>index.influx || queue.email.length>index.email){
      let current_email = queue.email[index.email];
      let current_influx = queue.influx[index.influx];
      let current_webhook = queue.webhook[index.webhook];

      if(current_email){
        send_notification_email(current_email.config, current_email.notify, current_email.host, current_email.check_command, current_email.state, current_email.message, ()=>{
          queue.email[index.email] = undefined;
          index.email++;

          loop();
        });
      }else if(current_influx){
        send_notification_influxdb(current_influx.config, current_influx.notify, current_influx.host, current_influx.check_command, current_influx.state, current_influx.message, current_influx.stdout, ()=>{
          queue.influx[index.influx] = undefined;
          index.influx++;

          loop();
        });
      }else if(current_webhook){
        send_notification_webhook(current_webhook.config, current_webhook.notify, current_webhook.host, current_webhook.check_command, current_webhook.state, current_webhook.message, ()=>{
          queue.webhook[index.webhook] = undefined;
          index.webhook++;

          loop();
        })
      }else{
        loop();
      }
    }else{
      callback();
    }
  }

  loop();
}

module.exports.init_vars = function(){
  index.email = 0;
  index.influx = 0;
  index.webhook = 0;

  queue.email = [];
  queue.influx = [];
  queue.webhook = [];
}

module.exports.add_email = function(mail_object){
  queue.email.push(mail_object);
}

module.exports.add_influx = function(influx_object){
  queue.influx.push(influx_object);
}

module.exports.add_webhook = function(webhook_object){
  queue.webhook.push(webhook_object);
}
