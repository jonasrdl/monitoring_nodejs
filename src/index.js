const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const {NodeSSH} = require('node-ssh');
const path = require('path');

const run_host_commands = require('./run_host_commands.js');
const send_notification = require('./notification/send_notification.js');

const notification_thread = require('./notification/notification_thread.js');
notification_thread.init_vars();

const command_dir = 'commands/';
const host_dir = 'hosts/';

const config = JSON.parse(fs.readFileSync('config.json'));

if(validate_config()){
  console.log('Config validated!');

  fs.readdir(command_dir, (err, files) => {
    var commands = {};

    files.forEach(file => {
      var command = JSON.parse(fs.readFileSync(command_dir + '/' + file));

      commands[command.name] = command;
    });

    console.log('Loaded commands');

    var hosts = [];
    var hosts_map = new Map();

    fs.readdir(host_dir, (err, files) => {
      files.filter(file => { return path.extname(file).toLowerCase() === '.json' }).forEach(file => {
        var host = JSON.parse(fs.readFileSync(file));

        if(validate_host(host)){
          host.check_commands.forEach((command, i) => {
            if(!command.unique_name){
              host.check_commands[i].unique_name = generate_unique_name(command);
            }
          });

          hosts_map[host.name] = host;

          if(host.remote){
            hosts_map[host.name].connect = function(){
              console.log('Connecting to ' + host.vars.hostname);

              hosts_map[host.name].ssh = new NodeSSH();
              hosts_map[host.name].ssh.connect({ host: host.vars.hostname, port: host.vars.port, username: host.vars.username, privateKey: host.vars.privateKeyPath }).then(() => {
                hosts_map[host.name].connected = true;

                console.log('Connection to ' + host.vars.hostname + ' established!');

                const ssh_command = {
                  unique_name: 'ssh',
                  command_name: 'ssh'
                }
                const error_or_warning = { state: 'ok', message: 'error:\n\n' + '\nstdout:\n\n'};
                send_notification(notification_thread, config, host, ssh_command, error_or_warning.state, error_or_warning.message, undefined);
              }).catch((e) => {
                console.log('Connection to ' + host.vars.hostname + ' failed, will try again');

                console.log(e);

                const ssh_command = {
                  unique_name: 'ssh',
                  command_name: 'ssh'
                }
                const error_or_warning = { state: 'error', message: 'error:\n\n' + e + '\nstdout:\n\n'};
                send_notification(notification_thread, config, host, ssh_command, error_or_warning.state, error_or_warning.message, undefined);

                setTimeout(() => {
                  hosts_map[host.name].connected = false;
                  host.connect();
                }, 10000);
              });
            }

            host.connect();
          }

          hosts.push(host.name);
        }
      });

      console.log('Loaded hosts');

      var loop = function(){
        //SEND OUT NOTIFICATIONS
        notification_thread.thread(()=>{
          console.log('Sent notifications!');

          setTimeout(()=>{
            let todo = 0;
            let ran = 0;

            hosts.forEach(host => {
              if(!hosts_map[host].remote || hosts_map[host].connected){
                console.log('Checking: ' + host);

                todo++;

                run_host_commands(config, hosts_map[host], commands, (host, check_command, state, message, stdout)=>{
                  send_notification(notification_thread, config, host, check_command, state, message, stdout);
                }, ()=>{
                  ran++;

                  if(ran >= todo){
                    loop();
                  }
                }, (host, e) => {
                  //reconnect

                  host.connect();

                  const ssh_command = {
                    unique_name: 'ssh',
                    command_name: 'ssh'
                  }
                  const error_or_warning = { state: 'error', message: 'error:\n\n' + e + '\nstdout:\n\n'};
                  send_notification(notification_thread, config, host, ssh_command, error_or_warning.state, error_or_warning.message, undefined);

                  ran++;

                  if(ran >= todo){
                    ran = -1;

                    loop();
                  }
                });
              }else{
                console.log('Skipping: ' + host + ' not yet connected');
              }
            });
          },1000*config.check_time);
        });
      }

      loop();
    })
  });
}else{
  console.log('Config validation failed!');
}

function generate_unique_name(command){
  var unique_name = command.command_name;

  if(command.vars && Object.keys(command.vars).length > 0){
    Object.keys(command.vars).forEach((key) => {
      unique_name += '-' + command.vars[key];
    });
  }else{
    unique_name += '-' + uuidv4();
  }

  return unique_name;
}

function validate_config(){
  if(config){
    if(!config.reoccurring_error_message_time){
      console.log('reoccurring_error_message_time missing in config');
      return false;
    }

    if(!config.reoccurring_warning_message_time){
      console.log('reoccurring_warning_message_time missing in config');
      return false;
    }

    if(!config.check_time){
      console.log('check_time missing in config');
      return false;
    }

    if(!config.command_timeout){
      console.log('command_timeout missing in config');
      return false;
    }

    if(!config.validate_error){
      console.log('validate_error missing in config');
      return false;
    }

    return true;
  }else{
    console.log('config.json not found!');
    return false;
  }
}

function validate_host(host){
  if(host){
    if(host.remote){
      if(host.vars){
        if(!host.vars.hostname){
          console.log('hostname missing in host config');
          return false;
        }else if(!host.vars.username){
          console.log('username missing in host config');
          return false;
        }else if(!host.vars.privateKeyPath){
          console.log('privateKeyPath missing in host config');
          return false;
        }else{
          if(!host.vars.port){
            host.vars.port = 22;
          }

          return true;
        }
      }else{
        console.log('vars array missing in host config');
        return false;
      }
    }else{
      return true;
    }
  }else{
    console.log('failed to validate host config');
    return false;
  }
}
