from tornado.websocket import WebSocketHandler
from tornado.web import Application, RequestHandler, StaticFileHandler
from tornado.httpserver import HTTPServer
from tornado.ioloop import IOLoop
import os
import logging
import signal
from decouple import config
import json
from sequencer import Sequencer
from phases import PhaseArray

def launch_app():

  hostname = os.uname()[1]
  if len(hostname.split('.')) != 2:
    hostname += '.local'

  phase_array = PhaseArray()

  class DefaultHandler(RequestHandler):
    def prepare(self):
      self.set_status(404)

  class MainHandler(RequestHandler):
    async def get(self):
      self.render(
        'index.html',
        hostname=hostname,
        port=config('PORT', default=8888, cast=int)
      )

  class WebSocket(WebSocketHandler):
    def open(self):
        logging.info("WebSocket opened")
    async def on_message(self, message):
        result = await phase_array.parse_message(message)
        if result: self.write_message(json.dumps(result))
    def on_close(self):
        logging.info("WebSocket closed")

  def make_app():
    path = os.path.dirname(os.path.abspath(__file__))
    settings = dict(
      template_path = os.path.join(path, 'templates'),
      static_path = os.path.join(path, 'static'),
      debug = True,
      websocket_ping_interval = 10
    )

    urls = [
      (r'/websocket', WebSocket),
      (r'/', MainHandler)
    ]

    return Application(urls, **settings)

  application = make_app()
  http_server = HTTPServer(application)
  http_server.listen(config('PORT', default=8888, cast=int))
  main_loop = IOLoop.current()
  main_loop.start()

if __name__ == '__main__':

  def signalHandler(signum, frame):
    print()
    logging.warning('Caught termination signal: %s' % signum)
    shutdown(status=1)

  def shutdown(status=1):
    os._exit(status)

  signal.signal(signal.SIGTERM, signalHandler)
  signal.signal(signal.SIGHUP, signalHandler)
  signal.signal(signal.SIGINT, signalHandler)

  logging.basicConfig(
      level=10,
      format='[PHASES WEB APP] - %(levelname)s | %(message)s'
    )

  try:
    launch_app()
  except Exception as e:
    logging.error('Uncaught while running main(): %s' % repr(e))
  finally:
    shutdown(0)