const fs = require('fs');
const readline = require('readline');

const command_dir = 'commands/';

var config = {};

var mailAvailable = false;
var influxAvailable = false;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

if(!fs.existsSync('config.json')){
  config = {
    reoccurring_error_message_time: 60,
    reoccurring_warning_message_time: 1440,
    check_time: 5,
    command_delay: 2,
    command_timeout: 5,
    validate_error: 3
  }

  console.log('First time setup');

  mailSetup((mailConfig) => {
    config.mail = mailConfig;

    influxSetup((influxConfig) => {
      config.influxdb = influxConfig;

      fs.writeFileSync('config.json', JSON.stringify(config));

      console.log('Wrote config.json');

      mainSetup();
    });
  });
}else{
  config = require('./config.json');

  console.log('Read config.json');

  mainSetup();
}

function mainSetup(){
  mailAvailable = config.mail.host !== undefined || config.mail.service !== undefined;
  influxAvailable = config.influxdb.host !== undefined;

  rl.question('Do you want to set up a new host? (y/n) ', (response) => {
    if(response === "y"){
      hostSetup((host) => {
        fs.writeFileSync('hosts/' + host.name + '.json', JSON.stringify(host));

        console.log('Wrote ' + 'hosts/' + host.name + '.json');

        mainSetup();
      });
    }else{
      console.log('Make sure to restart the monitoring service!');
      process.exit(0);
    }
  });
}

function mailSetup(callback){
  let mailConfig = {};

  rl.question('Do you want to set up mail notifications? (y/n) ', (response) => {
    if(response === "y"){
      rl.question('SMTP hostname ', (hostname) => {
        mailConfig.host = hostname;

        rl.question('SMTP port ', (port) => {
          mailConfig.port = port;

          rl.question('SMTP username ', (username) => {
            mailConfig.auth = { user: username };

            rl.question('SMTP password ', (password) => {
              mailConfig.auth.pass = password;

              callback(mailConfig);
            })
          });
        });
      });
    }else{
      callback(mailConfig);
    }
  });
}

function influxSetup(callback){
  let influxConfig = {};

  rl.question('Do you want to set up InfluxDB? (y/n) ', (response) => {
    if(response === 'y'){
      rl.question('InfluxDB hostname ', (hostname) => {
        influxConfig.host = hostname;

        rl.question('InfluxDB database ', (database) => {
          influxConfig.database = database;

          rl.question('InfluxDB username ', (username) => {
            influxConfig.username = username;

            rl.question('InfluxDB password ', (password) => {
              influxConfig.password = password;

              callback(influxConfig);
            });
          });
        });
      });
    }else{
      callback(influxConfig);
    }
  });
}

function hostSetup(callback){
  let host = {};

  rl.question('Name ', (name) => {
    host.name = name;

    rl.question('Remote? (y/n) ', (response) => {
      let continueFromInflux = function(){
        var commandNames = [];
        var commands = {};

        fs.readdir(command_dir, (err, files) => {
          files.forEach(file => {
            var command = JSON.parse(fs.readFileSync(command_dir + '/' + file));

            commands[command.name] = command;
            commandNames.push(command.name);
          });

          console.log('The following commands are available: ');

          commandNames.forEach((command, i) => {
            console.log('(' + i + ')' + ' ' + command);
          });

          rl.question('Which commands should be run on the host (comma separated)? ', (run_commands) => {
            const run_commands_array = run_commands.split(',');

            host.check_commands = [];

            let command_index = 0;

            const loop = function(){
              if(command_index < run_commands_array.length){
                const command = commands[commandNames[run_commands_array[command_index]]];

                commandSetup(command, (command_with_vars) => {
                  host.check_commands.push(command_with_vars);

                  command_index++;
                  loop();
                });
              }else{
                callback(host);
              }
            }

            loop();
          });
        });
      }

      let continueFromMail = function(){
        if(influxAvailable){
          rl.question('Do you want to setup influxdb? (y/n) ', (response) => {
            if(response === 'y'){
              host.notify.push({ how: 'influx' });
            }

            continueFromInflux();
          });
        }else{
          continueFromInflux();
        }
      }

      let continueFromRemote = function(){
        host.notify = [];

        if(mailAvailable){
          rl.question('Do you want to get notified by mail? (y/n) ', (response) => {
            if(response === 'y'){
              rl.question('From email ', (from) => {
                host.notify.push({ how: 'email', vars: { from: from } });

                continueFromMail();
              });
            }else{
              continueFromMail();
            }
          });
        }else{
          continueFromMail();
        }
      }

      if(response === 'y'){
        host.remote = true;

        remoteSetup((remote) => {
          host.vars = remote;

          continueFromRemote();
        });
      }else{
        continueFromRemote();
      }
    });
  });
}

function remoteSetup(callback){
  let vars = {}

  rl.question('SSH hostname ', (hostname) => {
    vars.hostname = hostname;

    rl.question('SSH port ', (port) => {
      vars.port = port;

      rl.question('SSH username ', (username) => {
        vars.username = username;

        rl.question('SSH private key filepath ', (filepath) => {
          vars.privateKeyPath = filepath;

          callback(vars);
        });
      });
    });
  });
}

function commandSetup(command, callback){
  let command_with_vars = { command_name: command.name };

  if(command.required_vars.length > 0){
    command_with_vars.vars = {};

    let index = 0;

    const loop = function(){
      if(index < command.required_vars.length){
        rl.question('[' + command.name + '] ' + command.required_vars[index] + ' ', (response) => {
          command_with_vars.vars[command.required_vars[index]] = response;

          index++;
          loop();
        });
      }else{
        callback(command_with_vars)
      }
    }

    loop();
  }else{
    callback(command_with_vars);
  }
}
