from threading import Timer

class Interval(Timer):
  MIN = 0.05
  MAX = 2.0

  def __init__(self, interval, function):
    super().__init__(interval, function)
    self.daemon = True
    self._interval = interval
    self._function = function

  def run(self):
    self._function(*self.args, **self.kwargs)
    while not self.finished.wait(self._interval):
      self._function(*self.args, **self.kwargs)

  @property
  def interval(self):
    return self._interval

  @interval.setter
  def interval(self, interval):
    if interval > self.MAX:
      self._interval = self.MAX
    elif interval < self.MIN:
      self._interval = self.MIN
    else:
      self._interval = interval

  @property
  def function(self):
    return self._function

  @function.setter
  def function(self, function):
    self._function = function