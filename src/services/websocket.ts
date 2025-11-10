import { io } from '../app';

export const sendToClient = (event: string, data: any) => {
  io.emit(event, data);
};

io.on('connection', (socket) => {
  console.log('a user connected');
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});
