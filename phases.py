from interval import Interval
from sequencer import Sequencer
import logging
import signal
import os
from decouple import config
import json
from threading import Thread

logging.basicConfig(
  format='[PHASES] - %(levelname)s | %(message)s',
  level=logging.DEBUG
)

try:
  from CD4094 import CD4094
except Exception as e:
  logging.error(f"Unable to load CD4094: {repr(e)}")

#================================================================

class PhaseArray():
  def __init__(self, channels=8, refresh_rate=1/240, interval=1, steps=32, index=0):
    self._channels = channels
    self._refresh_rate = refresh_rate
    try:
      self._output = CD4094(channels=self._channels)
    except Exception as e:
      logging.error(f"Could not start CD4094: {repr(e)}")
      self._output = None
    self._master_sequencer = Sequencer(id='master', callback=self.trigger)
    self._refresh_rate = refresh_rate
    self._output_interval = None
    self._sequencers = []
    for i in range(self._channels):
      self._sequencers.append(Sequencer())

  #----------------------------------------------------------------
  @property
  def status(self):
    sequencer_statuses = []
    for s in self._sequencers:
      sequencer_statuses.append(s.status)
    return {
      'refresh_rate': self._refresh_rate,
      'is_running': self.is_running,
      'master_sequencer_status' : self._master_sequencer.status,
      'sequencer_statuses': sequencer_statuses
    }
  
  #----------------------------------------------------------------
  @property
  def is_running(self):
    if not self._output_interval:
      return False
    return self._output_interval.is_alive()

  #----------------------------------------------------------------
  def update_output(self):
    register = 0
    for i in range(len(self._sequencers)):
      register |= self._sequencers[i].output << i
    if self._output:
      self._output.update(register)

  #----------------------------------------------------------------
  def trigger(self):
    self._master_sequencer.update()
    for s in self._sequencers:
      if s.sync_flag and not s.is_running:
        Thread(target=s.update).start()

  #----------------------------------------------------------------
  def start(self):
   # Enable the output
    if self._output:
      self._output.enable()

    # Clear out existing intervals for updating the output and start a fresh one
    if self._output_interval: self._output_interval.cancel()  
    self._output_interval = Interval(self._refresh_rate, self.update_output)
    self._output_interval.start()

    self._master_sequencer.start()

    for s in self._sequencers:
      s.start()

  #----------------------------------------------------------------
  def stop(self):
    if self._output:
      self._output.disable()

    if self._output_interval.is_alive():
      self._output_interval.cancel()

    self._master_sequencer.stop()

    for s in self._sequencers:
      s.stop()

  #----------------------------------------------------------------
  async def set_sequencer(self, id, attributes):
    target = None
    if self._master_sequencer.id == id:
      target = self._master_sequencer

    for s in self._sequencers:
      if s.id == id:
        target = s
        
    if not target:
      return

    for attribute in attributes:
      match attribute['name']:
        case 'loop_point':
          target.loop_point = attribute['value']
        case 'index':
          target.index = attribute['value']
        case 'state':
          target.state = attribute['value']
        case 'step':
          target.set_value_at_step(attribute['value'], attribute['index'])
        case 'step_size':
          target.step_size = int(attribute['value'])
        case 'interval':
          target.interval = float(attribute['value'])
        case 'multiplier':
          target.multiplier = float(attribute['value'])
        case 'percentage':
          target.percentage = float(attribute['value'])
        case 'sync':
          logging.debug(f"id: {target.id}, sync: {attribute['value']}")
          if bool(attribute['value']):
            target.stop()
            target.sync_flag = True
          else:
            target.sync_flag = False
            target.start()
        case 'start':
          target.start()
        case 'stop':
          target.stop()
          target.sync_flag = False

  #----------------------------------------------------------------
  async def set_master(self, attributes):
    for attribute in attributes:
      match attribute['name']:
        case 'interval':
          self._master_sequencer.interval = attribute['value']
          for s in self._sequencers:
            s.interval = attribute['value']

  #----------------------------------------------------------------
  async def parse_message(self, message):
    #check that the message is valid JSON
    try:
      data = json.loads(message)
    except Exception as e:
      message = f"While parsing message: {repr(e)}"
      logging.error(message)
      return {
        'type': 'error',
        'data': message
      }

    match data['type']:
      case 'set':
        results = []
        for target in data['targets']:
          if target['type'] == 'master':
            result = await self.set_master(target['attributes'])
          elif target['type'] == 'sequencer':
            result = await self.set_sequencer(target['id'], target['attributes'])
          results.append(result)
      case 'fetch_status':
        return {
          'type': 'status',
          'data': self.status
        }
      case 'start_all':
        self.start()
      case 'stop_all':
        self.stop()
      case 'handshake':
        return {
          'type': 'handshake',
          'data': self.status
        }
      case 'reconnect':
        return {
          'type': 'reconnect',
          'data': self.status
        }
      case _:
        return {
          'type': 'error',
          'data': f"Unknown type."
        }

#================================================================

if __name__ == '__main__':
  from time import sleep

  def signalHandler(signum, frame):
    print()
    logging.warning('Caught termination signal: %s' % signum)
    shutdown(status=1)

  def shutdown(status=1):
    os._exit(status)

  signal.signal(signal.SIGTERM, signalHandler)
  signal.signal(signal.SIGHUP, signalHandler)
  signal.signal(signal.SIGINT, signalHandler)

  try:
    phase_array = PhaseArray()
    phase_array.start()
    while phase_array.is_running:
      sleep(1)
  except Exception as e:
    logging.error('Uncaught while running main(): %s' % repr(e))
  finally:
    shutdown(status=0)
