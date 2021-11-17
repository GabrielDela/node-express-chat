const sMessage = require('../models/message');

module.exports = function (io) {

  var users = [];
  io.on('connection', (socket) => {
    console.log(`Connecté au client ${socket.id}`)
    io.emit('notification', { type: 'new_user', data: socket.id });

    // Listener sur la déconnexion
    socket.on('disconnect', () => {
      console.log(`user ${socket.id} disconnected`);
      io.emit('notification', { type: 'removed_user', data: socket.id });

      if (socket.client_uuid != null) {
        const user = users.find(element => element.client_uuid == socket.client_uuid && element.id == socket.id);
        if (user != null) {
          const index = users.indexOf(user);
          if (index > -1) {
            users.splice(index, 1);
          }
          socket.leave('Global');
          socket.emit('disconnected');
          io.to('Global').emit('users', users);
        }
      }
    });

    socket.on('login', (data) => {
      users.push({ username: data.username, client_uuid: data.client_uuid, id: socket.id });
      socket.username = data.username;
      socket.client_uuid = data.client_uuid;
      socket.join('Global');
      socket.emit('connected', { client_uuid: data.client_uuid, username: data.username, channel: 'Global', channel_name: 'Global' });
      io.to('Global').emit('users', users);

      sMessage.find({ 'receiver': 'Global'}).then(data => {
        socket.emit('init', data);
      });
    });

    socket.on('logout', (e) => {
      const user = users.find(element => element.client_uuid == socket.client_uuid && element.id == socket.id);
      if (user != null) {
        const index = users.indexOf(user);
        if (index > -1) {
          users.splice(index, 1);
        }
        socket.leave('Global');
        socket.emit('disconnected');
        io.to('Global').emit('users', users);
      }
    });

    socket.on('channel_change', channel => {
      if(channel != 'Global'){
        sMessage.find({ $or:[ {'sender': socket.client_uuid, receiver: channel}, {'receiver': socket.client_uuid, 'sender': channel} ]}).then(data => {
          socket.emit('channel_changed', data);
        });
      }
      else{
        sMessage.find({ 'receiver': 'Global'}).then(data => {
          socket.emit('channel_changed', data);
        });
      }
    });

    socket.on('message', data => {
      const user = users.find(element => element.client_uuid == data.channel);

      var message = { sender: socket.client_uuid, receiver: data.channel, username: socket.username, message: data.message};
      var data = new sMessage(message);

      data.save(function (err, message) {
        if (err) return console.error(err);

        if (user != null) {
          socket.emit('private_message', message);
          io.to(user.id).emit('private_message', message);
        }
        else {
          io.to('Global').emit('message', message);
        }
      });
    });
  })
}