from interval import Interval
import logging
import signal
import os
import argparse
from random import getrandbits
from time import sleep
from secrets import token_urlsafe
import json

#================================================================

class Sequencer():
  def __init__(self, loop_point=None, index=0, step_size=1, state=0, length=32, interval=1, id=None, callback=None):
    self._state = int(state)
    self._length = length
    if loop_point:
      self._loop_point = int(loop_point) % self._length
    else:
      self._loop_point = self._length
    self._index = int(index) % self._loop_point
    self._step_size = int(step_size)
    self._timeout = float(interval)
    self._multiplier = 1.0
    self._percentage = 1.0
    self._interval = None
    self._output = 0
    self._sync_flag = False
    self._callback = callback
    if not id:
      self._id = token_urlsafe(16)
    else:
      self._id = id

  #----------------------------------------------------------------
  @property
  def status(self):
    return {
      'state' : self._state,
      'length': self._length,
      'index': self._index,
      'value': self.value,
      'loop_point': self._loop_point,
      'step_size': self._step_size,
      'interval': self._timeout,
      'multiplier': self._multiplier,
      'percentage': self._percentage,
      'id': self._id,
      'is_running': self.is_running
    }

  #----------------------------------------------------------------
  @property
  def sync_flag(self):
    return self._sync_flag

  @sync_flag.setter
  def sync_flag(self, value):
    self._sync_flag = bool(value)

  #----------------------------------------------------------------
  @property
  def id(self):
    return self._id

  #----------------------------------------------------------------
  @property
  def state(self):
    state = []
    for i in range(self._length):
      state.append(self._state >> i & 0b1)
    return state

  @state.setter
  def state(self, state):
    update = 0
    for i in range(self._length):
      update |= state[i] << i 
    self._state = update

  #----------------------------------------------------------------
  @property
  def index(self):
    return self._index

  @index.setter
  def index(self, index):
    self._index = max(0, min(int(index), self._length-1))
    return self._state >> self._index & 0b1

  #----------------------------------------------------------------

  @property
  def output(self):
    return self._output

  @property
  def value(self):
    return self._state >> (self._index % self._loop_point) & 0b1

  @value.setter
  def value(self, value):
    mask = pow(2, self._length) - 1
    mask ^= 0b1 << self._index
    self._state &= mask
    self._state |= (int(value) & 0b1) << self._index

  def get_value_at_step(self, step):
    return self._state >> (int(step) % self._loop_point) & 0b1

  def set_value_at_step(self, value, step):
    mask = pow(2, self._length) - 1
    mask ^= 0b1 << int(step)
    self._state &= mask
    self._state |= (int(value) & 0b1) << int(step)
    return self._state

  #----------------------------------------------------------------
  @property
  def multiplier(self):
    return self._multiplier

  @multiplier.setter
  def multiplier(self, value):
    self._multiplier = float(value)
    self.update_interval()
  
  #----------------------------------------------------------------
  @property
  def percentage(self):
    return self._percentage

  @percentage.setter
  def percentage(self, value):
    if value < 0.5:
      self._percentage = 0.5
    if value > 2.0:
      self._percentage = 2.0
    else:
      self._percentage = float(value)
    self.update_interval()
  #----------------------------------------------------------------
  @property
  def interval(self):
    if self._interval:
      return self._interval.interval
    return self._timeout

  @interval.setter
  def interval(self, interval):
    self._timeout = float(interval)
    self.update_interval()
  
  def update_interval(self):
    if self._interval:
      self._interval.interval = self._timeout / self._multiplier * self._percentage
  #----------------------------------------------------------------
  @property
  def loop_point(self):
    return self.loop_point

  @loop_point.setter
  def loop_point(self, loop_point):
    self._loop_point = max(1, min(int(loop_point), self._length))
    return self._loop_point

  #----------------------------------------------------------------
  @property
  def is_running(self):
    if self._interval:
      return self._interval.is_alive()
    return False

  #----------------------------------------------------------------

  def update(self):
    self._output = self.value
    self._index += self._step_size
    self._index %= self._loop_point
    sleep(self._timeout / self._multiplier * self._percentage / 2)
    self._output = 0

  def randomize(self):
    self._state = getrandbits(self._length)
    return self._state

  def clear(self):
    self._state = 0
    return self._state

  def start(self):
    if self._sync_flag:
      return

    if self._interval:
      self._interval.cancel()
    if not self._callback:
      callback = self.update
    else:
      callback = self._callback
    self._interval = Interval(self._timeout / self._multiplier * self._percentage, callback)
    self._interval.start()

  def stop(self):
    if self._interval:
      self._interval.cancel()
    self._output = 0

#================================================================

def signalHandler(signum, frame):
  print()
  logging.warning('Caught termination signal: %s' % signum)
  shutdown(status=1)

def shutdown(status=1):
  for sequencer in sequencers:
    if sequencer and sequencer.is_running:
      sequencer.stop()
  os._exit(status)

def main():
  for sequencer in sequencers:
    sequencer.randomize()
    sequencer.start()

  while sequencer.is_running:
    sequencer_statuses = []
    for s in sequencers:
      sequencer_statuses.append(s.status)
    print(json.dumps({
      'sequencer_statuses': sequencer_statuses,
    }, indent=2))
    sleep(1)

if __name__ == '__main__':
  signal.signal(signal.SIGTERM, signalHandler)
  signal.signal(signal.SIGHUP, signalHandler)
  signal.signal(signal.SIGINT, signalHandler)

  parser = argparse.ArgumentParser(description='phases')

  # create arguments
  parser.add_argument(
    '-t',
    dest='interval',
    default=1.0,
    type=float,
    help='Must be positive and non zero.'
  )

  # parse the args
  args = parser.parse_args()

  logging.basicConfig(
    format='[PHASES] - %(levelname)s | %(message)s',
    level=logging.DEBUG
  )

  sequencers = []
  for i in range(8):
    sequencers.append(Sequencer(interval=args.interval))

  try:
    main()
  except Exception as e:
    logging.error('Uncaught while running main(): %s' % repr(e))
  finally:
    shutdown(status=0)
