module.exports = function (notification_thread, config, host, check_command, state, message, stdout){
  host.notify.forEach((notify) => {
    switch(notify.how){
      case 'email':
        notification_thread.add_email({config, notify, host, check_command, state, message});
        break;
      case 'influx':
        notification_thread.add_influx({config, notify, host, check_command, state, message, stdout});
        break;
      case 'webhook':
        notification_thread.add_webhook({config, notify, host, check_command, state, message, stdout});
        break;

      default:
        console.log('Cant find notification type ' + notify.how);
    }
  });
}
