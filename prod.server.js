var express = require('express');
var config = require('./config/index');
var port = process.env.PORT || config.dev.port;

var app = express();

var router = express.Router();
// 用于静态展示入口
router.get('/', function (req, res, next) {
  req.url = './index.html';
  next();
});

app.use(router);


/*引入*/
var mongoose = require('mongoose')
// 日志文件
// var morgan = require('morgan')
var log4js = require('log4js');
log4js.configure({
    appenders: {
      out: { type: 'stdout' },
      app: { type: 'file', filename: 'application.log' }
    },
    categories: {
      default: { appenders: [ 'out', 'app' ], level: 'debug' }
    }
})
global.logger = log4js.getLogger()
// sesstion 存储
var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')
var session = require('cookie-session')
// 用于异步回调
mongoose.Promise = require('bluebird')
global.db = mongoose.connect("mongodb://localhost:27017/vuechat")

// 服务器提交的数据json化
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: true}))
// sesstion 存储
app.use(cookieParser())
app.use(session({
  secret: 'vuechat',
  resave: false,
  saveUninitialized: true
}))

var env = process.env.NODE_ENV || 'development'
if ('development' === app.get('env')) {
  app.set('showStackError', true)
  // app.use(morgan(':method :url :status'))
  app.use(log4js.connectLogger(logger, {level:log4js.levels.INFO}))
  app.locals.pretty = true
  mongoose.set('debug', true)
}

var server = app.listen(port)

// websocket
// var http = require('http').Server(app);
var io = require('socket.io')(server);
var Message = require('./models/message')
global.users = {}

io.on('connection', function (socket) {
  //监听用户发布聊天内容
  socket.on('message', function (obj) {
    //向所有客户端广播发布的消息
    var mess = {
      username: obj.username,
      src:obj.src,
      msg: obj.msg,
      img: obj.img,
      roomid: obj.room,
      time: obj.time
    }
    io.to(mess.roomid).emit('message', mess)
    global.logger.info(obj.username + '对房' + mess.roomid+'说：'+ mess.msg)
    // console.log(obj.username + '对房' + mess.roomid+'说：'+ mess.msg)
    if (obj.img === '') {
      var message = new Message(mess)
      message.save(function (err, mess) {
        if (err) {
          // console.log(err)
          global.logger.error(err)
        }
        // console.log(mess)
        global.logger.info(mess)
      })
    }
  })
  socket.on('login',function (obj) {
    socket.name = obj.name
    socket.room = obj.roomid
    if (!global.users[obj.roomid]) {
      global.users[obj.roomid] = {}
    }
    global.users[obj.roomid][obj.name] = obj
    socket.join(obj.roomid)
    io.to(obj.roomid).emit('login', global.users[obj.roomid])
    global.logger.info(obj.name + '加入了' + obj.roomid)
  })
  socket.on('logout',function (obj) {
    try{
      const is = Object.hasOwnProperty.call(global.users[obj.roomid], obj.name)
      if (is) {
        delete  global.users[obj.roomid][obj.name]
        global.logger.info(obj.name + '退出了' + obj.roomid)
        io.to(obj.roomid).emit('logout', global.users[obj.roomid])
        socket.leave(obj.roomid)
      }
    } catch (e) {
      global.logger.error(e)
    }
  })

  socket.on('disconnect', function () {
    if (global.users[socket.room] && global.users[socket.room].length > 0) {
      delete global.users[socket.room][socket.name]
      // 用户监听用退出聊天室
      global.logger.info(socket.name + '退出了' + socket.room)
      socket.leave(obj.roomid)
      io.to(socket.room).emit('logout', global.users[socket.room])
    }
  })
})

require('./config/routes-build.js')(app)
//声明静态资源地址
app.use(express.static('./dist'));
