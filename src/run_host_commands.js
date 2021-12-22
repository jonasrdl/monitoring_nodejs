const { exec } = require("child_process");

let run_count = 0;

module.exports = function (config, host, commands, notification_callback, callback, reconnect_callback){
  run_count++;

  let i = 0;

  let loop = function(){
    if(i < host.check_commands.length){
      let check_command = host.check_commands[i];

      if(!commands[check_command.command_name]){
        console.log('[' + host.name + ']' + ' Could not find command: ' + check_command.command_name);
      }else{
        let command = commands[check_command.command_name];

        command = parse_base64_command(command);

        command = parse_required_vars_command(command, check_command);

        if(!command){
          console.log('[' + host.name + ']' + ' Not enough vars for command!');

          i++;
          loop();
        }else{
          if(!command.every || run_count % command.every === 0){
            console.log('[' + host.name + ']' + ' Running command: ' + check_command.command_name);

            exec_command(host, command.command, config.command_delay, config.validate_error, config.command_timeout, (result) => {
              let error_or_warning = {};

              if(result.error){
                error_or_warning = { state: 'error', message: 'error:\n\n' + result.error + '\nstdout:\n\n' + result.stdout};
              }else if(result.stderr){
                error_or_warning = { state: 'error', message: 'stderr:\n\n' + result.stderr + '\nstdout:\n\n' + result.stdout};
              }else{
                error_or_warning = check_for_method(result.error, result.stderr, result.stdout, 'error', command.failure_on, command.failure_value);

                if(!error_or_warning){
                  error_or_warning = check_for_method(result.error, result.stderr, result.stdout, 'warning', command.warning_on, command.warning_value);
                }

                if(!error_or_warning){
                    //COMMAND IS STATE OK
                    error_or_warning = { state: 'ok', message: 'stdout:\n\n' + result.stdout};
                }
              }

              let debug_command_callback = function(){
                if(command.multiple_lines_multiple_notifications){
                  //send a notification for every line of stdout
                  parse_multiline_stdout(host, check_command, result.stdout, error_or_warning, notification_callback);
                }else{
                  notification_callback(host, check_command, error_or_warning.state, error_or_warning.message, result.stdout);
                }
              }

              if(command.debug_command){
                exec_command(host, command.debug_command, 0, 1, config.command_timeout, (debug_result)=>{
                  error_or_warning.message += '\n\nDebug information:\n\n' + 'stdout:\n\n' +  debug_result.stdout + '\nstderr:\n\n' + debug_result.stderr + '\n';

                  debug_command_callback();
                }, reconnect_callback);
              }else{
                debug_command_callback();
              }

              i++;
              loop();

            }, reconnect_callback);
          }else{
            console.log('[' + host.name + ']' + ' Skipping command: ' + check_command.command_name);

            i++;
            loop();
          }
        }
      }
    }else{
      callback();
    }
  }

  loop();
}

function parse_required_vars_command(command, check_command){
  let has_required_vars = true;

  command.required_vars.forEach((required_var) => {
    if(!check_command.vars[required_var]){
      has_required_vars = false;
    }else{
      command.command = command.command.replace('$' + required_var, check_command.vars[required_var]);

      if(command.debug_command){
        command.debug_command = command.debug_command.replace('$' + required_var, check_command.vars[required_var]);
      }
    }
  });

  if(has_required_vars){
    return command;
  }else{
    return undefined;
  }
}

function parse_multiline_stdout(host, check_command, stdout, error_or_warning, notification_callback){
  let k = 0;
  let lines = stdout.split('\n');

  lines.forEach((line) => {
    if(line){
      let modified_check_command = JSON.parse(JSON.stringify(check_command));
      modified_check_command.unique_name = check_command.unique_name + '-' + k;

      notification_callback(host, modified_check_command, error_or_warning.state, error_or_warning.message, line);

      k++;
    }
  });
}

function parse_base64_command(command){
  if(!command.command){
    if(command.command_base64){
      command.command = (Buffer.from(command.command_base64, 'base64')).toString('ascii');
    }
  }

  if(!command.debug_command){
    if(command.debug_command_base64){
      command.debug_command = (Buffer.from(command.debug_command_base64, 'base64')).toString('ascii');
    }
  }

  return command;
}

function exec_command(host, command, command_delay, runs, timeout, callback, reconnect_callback){
  if(host.ssh){
    exec_command_ssh(host, command, command_delay, runs, timeout, callback, reconnect_callback)
  }else{
    exec_command_local(command, command_delay, runs, timeout, callback)
  }
}

function exec_command_local(command, command_delay, runs, timeout, callback){
  setTimeout(()=>{
    let i = 0;

    let lastError = '';
    let lastStderr = '';
    let lastStdout = '';

    let command_callback = function(){
      if(i < runs){
        exec('timeout ' + timeout + ' ' + command, (error, stdout, stderr) => {
          if(error || stderr){
            i++;

            lastError = error;
            lastStderr = stderr;
            lastStdout = stdout;

            command_callback();
          }else{
            //NO MORE error
            callback({error: error, stdout:stdout, stderr:stderr});
          }
        });
      }else{
        //MULTIPLE TRIES FAILED
        callback({error: lastError, stdout:lastStderr, stderr:lastStdout});
      }
    }

    command_callback();
  }, command_delay*1000);
}

function exec_command_ssh(host, command, command_delay, runs, timeout, callback, reconnect_callback){
  setTimeout(()=>{
    let i = 0;

    let lastError = '';
    let lastStderr = '';
    let lastStdout = '';

    let command_callback = function(){
      if(i < runs){
        host.ssh.execCommand('timeout ' + timeout + ' ' + command).then((result) => {
          let error = '';
          let stderr = result.stderr;
          let stdout = result.stdout;

          if(error || stderr){
            i++;

            lastError = error;
            lastStderr = stderr;
            lastStdout = stdout;

            command_callback();
          }else{
            //NO MORE error
            callback({error: error, stdout:stdout, stderr:stderr});
          }
        }).catch((e) => {
          console.log(e);

          reconnect_callback(host, e);
        });
      }else{
        //MULTIPLE TRIES FAILED
        callback({error: lastError, stdout:lastStderr, stderr:lastStdout});
      }
    }

    command_callback();
  }, command_delay*1000);
}

function check_for_method(error, stderr, stdout, failure_state, command_method, command_value){
  stdout = stdout.replace(/\r?\n|\r/g, '');

  switch(command_method){
    case 'out_larger_than_value':
      if(stdout > command_value){
        return({ state: failure_state, message: stdout + ' is bigger than ' + failure_state + ' value ' + command_value});
      }else{
        return({ state: 'ok'});
      }

      break;
    case 'out_smaller_than_value':
      if(stdout < command_value){
        return({ state: failure_state, message: stdout + ' is smaller than ' + failure_state + ' value ' + command_value});
      }else{
        return({ state: 'ok'});
      }

      break;
    case 'value_exact_out':
      if(command_value == stdout){
        return({ state: failure_state, message: stdout + ' is exactly ' + failure_state + ' value ' + command_value});
      }else{
        return({ state: 'ok'});
      }

      break;
    case 'value_not_exact_out':
      if(command_value != stdout){
        return({ state: failure_state, message: stdout + ' is not ' + failure_state + ' value ' + command_value});
      }else{
        return({ state: 'ok'});
      }

      break;
    default:
      return undefined;
  }
}
