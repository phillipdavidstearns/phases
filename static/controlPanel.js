let hostname;
let port;
let ws;
let status;
let interval;
let sequencers;

const divisions = [
  {
    'name': 'WT',
    'multiplier': 1/6
  },
  {
    'name': 'W',
    'multiplier': 1/4
  },
  {
    'name': 'HT',
    'multiplier': 1/3
  },
  {
    'name': 'H',
    'multiplier': 1/2
  },
  {
    'name' : 'Q',
    'multiplier': 1
  },
  {
    'name' : 'QT',
    'multiplier': 1.5
  },
  {
    'name' : '8',
    'multiplier': 2
  },
  {
    'name' : '8T',
    'multiplier': 3
  },
  {
    'name' : '16',
    'multiplier': 4
  },
  {
    'name' : '8Q',
    'multiplier': 5
  },
  {
    'name' : '16T',
    'multiplier': 6
  },
  {
    'name' : '32',
    'multiplier': 8
  }
];

//================================================================

(function() {
  'use strict';
  window.addEventListener('load', async function() {
    hostname = document.getElementById('hostname').value;
    port = document.getElementById('port').value;
    console.log(`hostname: ${hostname}`);
    const button = document.getElementById('websocket-connect');
    button.addEventListener('click', async () => {
      ws = await websockConnect(true);
    });
    ws = await websockConnect(false);
  }, false);
})();

//================================================================

async function websockConnect(reconnect){
  const status = document.getElementById('websocket-status');
  const button = document.getElementById('websocket-connect');

  const websocket = new WebSocket(`ws://${hostname}:${port}/websocket`);

  websocket.onopen = async function() {
    status.textContent='connecting...';
    console.log('Websocket connection established.');
    
    if (reconnect){
      await websocket.send(JSON.stringify({
        'type' : 'reconnect',
        'data' : 'Attempting to reconnect.'
      }));
    } else {
      await websocket.send(JSON.stringify({
        'type' : 'handshake',
        'data' : 'Hello from Phases client.'
      }));
    }
  };

  websocket.onmessage = async function (evt) {
    const result = await parse_message(
      JSON.parse(evt.data)
    );
  };

  websocket.onclose = async function () {
    if (interval) clearInterval(interval);
    status.textContent='disconnected';
    button.disabled=false;
  };

  return websocket;
}

//================================================================

async function parse_message(message){
  switch(message.type){
    case 'status':
      showCurrentStep(message.data.master_sequencer_status);
      setCurrentLoopPoint(message.data.master_sequencer_status);
      message.data.sequencer_statuses.forEach((s) => {
        showCurrentStep(s);
        setCurrentLoopPoint(s);
      });
      break;
    case 'result':
      console.log(`${message.type}`, message.data);
      break;
    case 'message':
      console.log(message.data);
      break;
    case 'handshake':
      console.log('Receiving handshake response.');
      document.getElementById('websocket-status').textContent = 'connected';
      document.getElementById('websocket-connect').disabled = true;
      initGUI(message);
      break;
    case 'reconnect':
      console.log('Receiving reconnection response.');
      document.getElementById('websocket-status').textContent = 'connected';
      document.getElementById('websocket-connect').disabled = true;
      document.getElementById('master-sequencer-controls').replaceChildren();
      document.getElementById('master-controls').replaceChildren();
      document.getElementById('sequencer-controls').replaceChildren();
      initGUI(message)
      break;
    case 'error':
      console.error(message.data);
      break;
  }
}

//================================================================

function initGUI(message){
  const { sequencer_statuses } = message.data;
  const { master_sequencer_status } = message.data;

  sequencer_statuses.forEach((s) => {
    const row = generateSequencerControlRow(s);
    document.getElementById('sequencer-controls').appendChild(row);
    showCurrentStep(s);
    setCurrentLoopPoint(s);
  });

  document.getElementById('master-sequencer-controls').appendChild(
    generateSequencerControlRow(master_sequencer_status)
  );
  showCurrentStep(message.data.master_sequencer_status);
  setCurrentLoopPoint(message.data.master_sequencer_status);
  
  generateMasterControls(sequencer_statuses);

  if (interval){
    clearInterval(interval);
  }
  interval = setInterval(() => {
    ws.send(JSON.stringify({
      'type': 'fetch_status'
    }));
  }, 1/20.0);
}

//================================================================

function generateTempoButton(division, id, callback){
  const col = document.createElement('div');
    col.setAttribute('class','col p-1');
    const button = document.createElement('input');
    button.setAttribute('type','radio');
    button.setAttribute('class','btn-check');
    button.setAttribute('name',`seq-${id}-tempo-options`);
    button.setAttribute('id',`seq-${id}-tempo-${division['name']}`);
    button.value = division['multiplier'];
    button.addEventListener('click', callback);
    const label = document.createElement('label');
    label.setAttribute('class','p-1 w-100 btn btn-sm btn-outline-secondary');
    label.setAttribute('for',`seq-${id}-tempo-${division['name']}`);
    label.textContent=division['name'];
    col.appendChild(button);
    col.appendChild(label);
  return col;
}

//================================================================

function generateTempoRadio(id, callback){

  const radio = document.createElement('div');
  radio.setAttribute('id',`seq-${id}-tempo-radio`);
  radio.setAttribute('class','row align-items-center justify-content-center m-0');

  divisions.forEach((division) => {
    const col = generateTempoButton(division, id, callback);
    radio.appendChild(col);
  });
  return radio;
}

//================================================================

function generateMasterTempoRadio(sequencers){

  const callback = (e) => {
    const targets = sequencers.map((s) => {
      return {
        'type': 'sequencer',
        'id': s.id,
        'attributes':[{
          'name': 'multiplier',
          'value': e.target.value
        }]
      }
    })
    ws.send(JSON.stringify({
      'type':'set',
      'targets': targets
    }));
  };

  return generateTempoRadio('main', callback);
}

//================================================================

function generateSequencerStep(id, index, buttonCallback, checkCallback, radioCallback){
  const br = document.createElement('br');

  const step = document.createElement('div');
    step.setAttribute('class','col form-check-inline p-1 m-1 text-center border border-1 rounded rounded-1');
    step.setAttribute('id',`seq-${id}-div-${index}`);

      const button = document.createElement('button');
      button.setAttribute('class','btn btn-sm btn-secondary px-1 py-0 font-monospace my-1');
      button.textContent = String(index+1).padStart(2, '0');
      button.addEventListener('click', buttonCallback);

    step.appendChild(button);
    step.appendChild(br.cloneNode());

      const check = document.createElement('input');
      check.setAttribute('id',`seq-${id}-step-${index}`);
      check.setAttribute('type','checkbox');
      check.setAttribute('class','btn-check');
      check.addEventListener('click', checkCallback);

    step.appendChild(check);

      const label = document.createElement('label');
      label.setAttribute('class','btn btn-sm btn-outline-secondary px-1 py-0 font-monospace my-1');
      label.setAttribute('for',`seq-${id}-step-${index}`);
      label.textContent = String(index+1).padStart(2, '0');

    step.appendChild(label);
    step.appendChild(br.cloneNode());

      const radio = document.createElement('input');
      radio.setAttribute('type','radio');
      radio.setAttribute('name',`seq-${id}-loop-point`);
      radio.setAttribute('id',`seq-${id}-loop-point-${index}`);
      radio.setAttribute('value', index+1);
      radio.setAttribute('class','form-check-input');
      radio.addEventListener('click', radioCallback);

    step.appendChild(radio);
  return step
}

//================================================================

function generateMasterSequencerControls(sequencers){
  const sequencerControlRow = document.createElement('div');
  sequencerControlRow.setAttribute('class','row mb-2 align-items-center justify-content-center');

  const sequencerSteps = document.createElement('div');
  sequencerSteps.setAttribute('class','row p-1 align-items-center justify-content-center m-0');

  for(let j = 0; j < parseInt(sequencers[0].length); j++){

    const buttonCallback = () => {
      const targets = sequencers.map((s) => {
        return {
          'type': 'sequencer',
          'id': s.id,
          'attributes':[{
            'name': 'index',
            'value': j
          }]
        };
      });
      const message = {
        'type':'set',
        'targets': targets
      }
      ws.send(JSON.stringify(message));
    };

    const checkCallback = (e) => {
      const targets = sequencers.map((s) => {
        document.getElementById(`seq-${s.id}-step-${j}`).checked = e.target.checked;
        return {
          'type': 'sequencer',
          'id': s.id,
          'attributes':[{
            'name': 'step',
            'index': j,
            'value': e.target.checked
          }]
        };
      });
      const message = {
        'type':'set',
        'targets': targets
      };
      ws.send(JSON.stringify(message));
    };

    const radioCallback = (e) => {
      const targets = sequencers.map((s) => {
        document.getElementById(`seq-${s.id}-loop-point-${j}`).checked = e.target.checked;
        return {
          'type': 'sequencer',
          'id': s.id,
          'attributes':[{
            'name': 'loop_point',
            'value': e.target.value
          }]
        };
      });
      const message = {
        'type':'set',
        'targets': targets
      };
      ws.send(JSON.stringify(message));
    };

    const sequencerStep = generateSequencerStep('main', j, buttonCallback, checkCallback, radioCallback);
    sequencerSteps.appendChild(sequencerStep);
  }
  sequencerControlRow.appendChild(sequencerSteps);

  // Create a row for the pattern selection buttons
  const sequencerPatterns = document.createElement('div');
  sequencerPatterns.setAttribute('class','row p-1 align-items-center justify-content-center m-0');
  // Add buttons to select every nth 1-8 step
  for(let j = 0; j < 8; j++){
    const everyNth = document.createElement('button');
    everyNth.setAttribute('class','col btn btn-sm btn-outline-secondary mx-1');
    everyNth.textContent=`${(j+1)}s`;
    everyNth.addEventListener('click', () => {
      sequencers.forEach(s => setSequencerPattern(s, j+1))
    });
    sequencerPatterns.appendChild(everyNth);
  }

  // Add a button for randomization of selected steps
  const random = document.createElement('button');
  random.setAttribute('class','col btn btn-sm btn-outline-secondary mx-1');
  random.textContent=`random`;
  random.addEventListener('click', () => {
    sequencers.forEach(s => randomizeSequencer(s))
  });
  sequencerPatterns.appendChild(random);

  // Add a button to clear selected steps
  const clear = document.createElement('button');
  clear.setAttribute('class','col btn btn-sm btn-outline-secondary mx-1');
  clear.textContent=`clear`;
  clear.addEventListener('click', () => {
    sequencers.forEach(s => clearSequencer(s))
  });
  sequencerPatterns.appendChild(clear);
  sequencerControlRow.appendChild(sequencerPatterns);

  return sequencerControlRow;
}

//================================================================

function generateSyncCheck(id, callback){
  const col = document.createElement('div');
  col.setAttribute('class','col-1 p-1');
    const check = document.createElement('input');
    check.setAttribute('id',`seq-${id}-sync-check`);
    check.setAttribute('type','checkbox');
    check.setAttribute('class','btn-check');
    check.addEventListener('click', callback);
  col.appendChild(check);
    const label = document.createElement('label');
    label.setAttribute('class','btn w-100 btn-outline-secondary');
    label.setAttribute('for',`seq-${id}-sync-check`);
    label.textContent = 'SYNC';
  col.appendChild(label);
  return col;
}

//================================================================

function generateTimingControls(id, syncCallback, resetCallback, rangeCallback, numberCallback){
  const timingControls = document.createElement('div');
  timingControls.setAttribute('class','row align-items-center justify-content-center m-0');

  const sync = generateSyncCheck(id, syncCallback);
  timingControls.appendChild(sync);

    const resetDiv = document.createElement('div');
    resetDiv.setAttribute('class','col-1 p-1');
      const reset = document.createElement('button');
      reset.setAttribute('class','btn btn-outline-secondary w-100');
      reset.setAttribute('value', 1.0);
      reset.textContent='reset';
      reset.addEventListener('click', resetCallback);
    resetDiv.appendChild(reset);
  timingControls.appendChild(resetDiv);

    const rangeDiv = document.createElement('div');
    rangeDiv.setAttribute('class','col-8 p-1');
      const range = document.createElement('input');
      range.setAttribute('type','range');
      range.setAttribute('class','form-range');
      range.setAttribute('id',`seq-${id}-percentage-range`);
      range.setAttribute('min','0.5');
      range.setAttribute('max','2.0');
      range.setAttribute('step','0.001');
      range.setAttribute('value','1.0');
      range.addEventListener('input', rangeCallback);
    rangeDiv.appendChild(range);
  timingControls.appendChild(rangeDiv);

    const percentageDiv = document.createElement('div');
    percentageDiv.setAttribute('class','col-2 p-1');
      const percentage = document.createElement('input');
      percentage.setAttribute('class','form-control');
      percentage.setAttribute('type','number');
      percentage.setAttribute('id',`seq-${id}-percentage-number`);
      percentage.setAttribute('min',0.5);
      percentage.setAttribute('max',2.0);
      percentage.setAttribute('step',0.01);
      percentage.setAttribute('value',1.0);
      percentage.addEventListener('change', numberCallback);
    percentageDiv.appendChild(percentage);
  timingControls.appendChild(percentageDiv);

  return timingControls;
}

//================================================================

function generateMasterTimingControls(sequencers){
  const id = 'main'

  const syncCallback = (e) => {
    const targets = sequencers.map((s) => {
      document.getElementById(`seq-${s.id}-sync-check`).checked = e.target.checked;
      return {
        'type': 'sequencer',
        'id': s.id,
        'attributes':[{
          'name': 'sync',
          'value': e.target.checked
        }]
      };
    });
    const message = {
      'type':'set',
      'targets': targets
    }
    ws.send(JSON.stringify(message));
  }

  const resetCallback = (e) => {
    document.getElementById(`seq-${id}-percentage-range`).value = e.target.value;
    document.getElementById(`seq-${id}-percentage-number`).value = e.target.value;
    const targets = sequencers.map((s) => {
      document.getElementById(`seq-${s.id}-percentage-range`).value = e.target.value;
      document.getElementById(`seq-${s.id}-percentage-number`).value = e.target.value;
      return {
        'type': 'sequencer',
        'id': s.id,
        'attributes':[{
          'name': 'percentage',
          'value': 1.0
        }]
      }
    });
    const message = {
      'type':'set',
      'targets': targets
    };
    ws.send(JSON.stringify(message));
  };

  const rangeCallback = (e) => {
    document.getElementById(`seq-${id}-percentage-number`).value = e.target.value;
    const targets = sequencers.map((s) => {
    document.getElementById(`seq-${s.id}-percentage-range`).value = e.target.value;
    document.getElementById(`seq-${s.id}-percentage-number`).value = e.target.value;
      return {
        'type': 'sequencer',
        'id': s.id,
        'attributes':[{
          'name': 'percentage',
          'value': e.target.value
        }]
      }
    });
    const message = {
      'type':'set',
      'targets': targets
    };
    ws.send(JSON.stringify(message));
  };

  const numberCallback = (e) => {
    document.getElementById(`seq-${id}-percentage-range`).value = e.target.value;
    const targets = sequencers.map((s) => {
      document.getElementById(`seq-${s.id}-percentage-range`).value = e.target.value;
      document.getElementById(`seq-${s.id}-percentage-number`).value = e.target.value;
      return {
        'type': 'sequencer',
        'id': s.id,
        'attributes':[{
          'name': 'percentage',
          'value': e.target.value
        }]
      }
    });
    const message = {
      'type':'set',
      'targets': targets
    };
    ws.send(JSON.stringify(message));
  };

  const timingControls = generateTimingControls(id, syncCallback, resetCallback, rangeCallback, numberCallback);
  return timingControls;
}
//================================================================

function generateMasterTempoControls(){
  const col = document.createElement('div');
  col.setAttribute('class','col-1');

  const masterTempoControls = document.createElement('div');
  masterTempoControls.setAttribute('class','row align-items-center justify-content-center m-0');

    const startDiv = col.cloneNode();
      const startButton = document.createElement('button');
      startButton.setAttribute('class','w-100 btn btn-outline-secondary');
      startButton.textContent = 'START';
      startButton.addEventListener('click', async () => {
        await ws.send(JSON.stringify({
          'type':'start_all'
        }));
      });
    startDiv.appendChild(startButton);

    const stopDiv = col.cloneNode();
      const stopButton = document.createElement('button');
      stopButton.setAttribute('class','w-100 btn btn-outline-secondary');
      stopButton.textContent = 'STOP';
      stopButton.addEventListener('click', async () => {
        await ws.send(JSON.stringify({
          'type':'stop_all'
        }));
      });
    stopDiv.appendChild(stopButton);

    const rangeDiv = document.createElement('div');
    rangeDiv.setAttribute('class','col-9');
      const range = document.createElement('input');
      range.setAttribute('id', 'master-tempo-range');
      range.setAttribute('type', 'range');
      range.setAttribute('class', 'form-range');
      range.setAttribute( 'min', 30.0);
      range.setAttribute('max', 150.0);
      range.setAttribute('step', 0.01);
      range.setAttribute('value', 120.0);
      range.addEventListener('input', async (e) => {
        document.getElementById('master-tempo-number').value = e.target.value;
        await setMasterInterval(e.target.value);
      });
    rangeDiv.appendChild(range);

    const numberDiv = col.cloneNode();
      const number = document.createElement('input');
      number.setAttribute('class','form-control');
      number.setAttribute('id','master-tempo-number');
      number.setAttribute('type','number');
      number.setAttribute('value', 120.0);
      number.setAttribute('min', 30.0);
      number.setAttribute('max', 150.0);
      number.addEventListener('change', async (e) => {
        document.getElementById('master-tempo-range').value = e.target.value;
        await setMasterInterval(e.target.value);
      });
    numberDiv.appendChild(number);

  masterTempoControls.appendChild(startDiv);
  masterTempoControls.appendChild(stopDiv);
  masterTempoControls.appendChild(rangeDiv);
  masterTempoControls.appendChild(numberDiv);
  return masterTempoControls;
}

//================================================================

function generateMasterControls(sequencers){

  // basic master tempo controls
  const masterControls = document.getElementById('master-controls');
  const masterTempoControls = generateMasterTempoControls();
  const masterSequencerControls = generateMasterSequencerControls(sequencers);
  const masterTimingControls = generateMasterTimingControls(sequencers);
  const masterTempoRadio = generateMasterTempoRadio(sequencers);
  masterControls.appendChild(masterTempoControls);
  masterControls.appendChild(masterSequencerControls);
  masterControls.appendChild(masterTimingControls);
  masterControls.appendChild(masterTempoRadio);
}

//================================================================

function generateSequencerTimingControls(sequencer){
  
  const syncCallback = (e) => {
    const message = {
      'type': 'set',
      'targets': [{
        'type': 'sequencer',
        'id': sequencer.id,
        'attributes':[{
          'name': 'sync',
          'value': e.target.checked
        }]
      }]
    };
    ws.send(JSON.stringify(message));
  };

  const resetCallback = (e) => {
    document.getElementById(`seq-${sequencer.id}-percentage-range`).value = e.target.value;
    document.getElementById(`seq-${sequencer.id}-percentage-number`).value = e.target.value;
    const message = {
      'type':'set',
      'targets':[{
        'type': 'sequencer',
        'id': sequencer.id,
        'attributes':[{
          'name': 'percentage',
          'value': 1.0
        }]
      }]
    };
    ws.send(JSON.stringify(message));
  };

  const rangeCallback = (e) => {
    document.getElementById(`seq-${sequencer.id}-percentage-number`).value = e.target.value;
    const message = {
      'type':'set',
      'targets':[{
        'type': 'sequencer',
        'id': sequencer.id,
        'attributes':[{
          'name': 'percentage',
          'value': e.target.value
        }]
      }]
    };
    ws.send(JSON.stringify(message));
  };

  const numberCallback = (e) => {
    document.getElementById(`seq-${sequencer.id}-percentage-range`).value = e.target.value;
    const message = {
      'type':'set',
      'targets':[{
        'type': 'sequencer',
        'id': sequencer.id,
        'attributes':[{
          'name': 'percentage',
          'value': e.target.value
        }]
      }]
    };
    ws.send(JSON.stringify(message));
  };

  const timingControls = generateTimingControls(sequencer.id, syncCallback, resetCallback, rangeCallback, numberCallback);
  return timingControls;
}

//================================================================

function generateSequencerControlRow(sequencer){
  const sequencerControlRow = document.createElement('div');
  sequencerControlRow.setAttribute('class','row p-0 mb-1 align-items-center justify-content-center border border-3 rounded rounded-1');

    const sequencerSteps = document.createElement('div');
    sequencerSteps.setAttribute('class','row p-1 align-items-center justify-content-center my-0');

    for(let j = 0; j < parseInt(sequencer.length); j++){
      const buttonCallback = () => {
        const message = {
          'type':'set',
          'targets': [{
            'type': 'sequencer',
            'id': sequencer.id,
            'attributes':[{
              'name': 'index',
              'value': j
            }]
          }]
        };
        ws.send(JSON.stringify(message));
      };

      const checkCallback = (e) => {
        const message = {
          'type':'set',
          'targets':[{
            'type': 'sequencer',
            'id': sequencer.id,
            'attributes':[{
              'name': 'step',
              'index': j,
              'value': e.target.checked
            }]
          }]
        };
        ws.send(JSON.stringify(message));
      };

      const radioCallback = (e) => {
        const message = {
          'type':'set',
          'targets':[{
            'type': 'sequencer',
            'id': sequencer.id,
            'attributes':[{
              'name': 'loop_point',
              'value': e.target.value
            }]
          }]
        };
        ws.send(JSON.stringify(message));
      };

      const sequencerStep = generateSequencerStep(sequencer.id, j, buttonCallback, checkCallback, radioCallback);
      sequencerSteps.appendChild(sequencerStep);
    }
    sequencerControlRow.appendChild(sequencerSteps);

    // Create a row for the pattern selection buttons
    const sequencerPatterns = document.createElement('div');
    sequencerPatterns.setAttribute('class','row p-1 align-items-center justify-content-center my-0');
    // Add buttons to select every nth 1-8 step
    for(let j = 0; j < 8; j++){
      const everyNth = document.createElement('button');
      everyNth.setAttribute('class','col btn btn-sm btn-outline-secondary mx-1');
      everyNth.textContent=`${(j+1)}s`;
      everyNth.addEventListener('click', async () => {
        setSequencerPattern(sequencer, j+1);
      });
      sequencerPatterns.appendChild(everyNth);
    }

    // Add a button for randomization of selected steps
    const random = document.createElement('button');
    random.setAttribute('class','col btn btn-sm btn-outline-secondary mx-1');
    random.textContent=`random`;
    random.addEventListener('click', async () => {
      randomizeSequencer(sequencer);
    });
    sequencerPatterns.appendChild(random);

    // Add a button to clear selected steps
    const clear = document.createElement('button');
    clear.setAttribute('class','col btn btn-sm btn-outline-secondary mx-1');
    clear.textContent=`clear`;
    clear.addEventListener('click', async () => {
      clearSequencer(sequencer);
    });
    sequencerPatterns.appendChild(clear);
    sequencerControlRow.appendChild(sequencerPatterns);

    const timingControls = generateSequencerTimingControls(sequencer);
    sequencerControlRow.appendChild(timingControls);

    const callback = (e) => {
      ws.send(JSON.stringify({
        'type':'set',
        'targets':[{
          'type': 'sequencer',
          'id': sequencer.id,
          'attributes':[{
            'name':'multiplier',
            'value':e.target.value
          }]
        }]
      }));
    };
    const tempoRadio = generateTempoRadio(sequencer.id, callback);
    sequencerControlRow.appendChild(tempoRadio);
    return sequencerControlRow;
}

//================================================================

function generateSequencerControls(sequencers){
  const sequencerControls = []; //document.getElementById('sequencer-controls');

  sequencers.forEach((sequencer) => {
    
    const sequencerControlRow = generateSequencerControlRow(sequencer);
    sequencerControls.append(sequencerControlRow);

    // This section initializes the GUI, but should be set based on actual settings on the controller
    // setTempoDivision(sequencer.id, 'Q');
  });
}

//================================================================

function showCurrentStep(sequencer){
  for(let i = 0; i < parseInt(sequencer.length); i++){
    const step = document.getElementById(`seq-${sequencer.id}-div-${i}`);
    if(i == sequencer.index){
      step.classList.add('bg-light');
    }else{
      step.classList.remove('bg-light');
    }
  }
}

//================================================================

function setTempoDivision(id, set){
  divisions.forEach((division) => {
    const tempo = document.getElementById(`seq-${id}-tempo-${division['name']}`);
    if(division['name'] === set){
      tempo.checked=true;
    } else {
      tempo.checked=false;
    }
  });
}

//================================================================

function setCurrentLoopPoint(sequencer){
  for(let i = 0; i < parseInt(sequencer.length); i++){
    const step = document.getElementById(`seq-${sequencer.id}-loop-point-${i}`);
    if(i === sequencer.loop_point - 1){
      step.checked = true;
    }else{
      step.checked = false;
    }
  }
}

//================================================================

function setSequencerPattern(sequencer, mult){
  let state = [];
  for(let i = 0; i < parseInt(sequencer.length); i++){
    const step = document.getElementById(`seq-${sequencer.id}-step-${i}`);
    if (i % mult === 0){
      state.push(1);
      step.checked=true;
    } else {
      state.push(0);
      step.checked=false;
    }
  }
  const message = {
    'type': 'set',
    'targets':[{
      'type': 'sequencer',
      'id': sequencer.id,
      'attributes':[{
        'name': 'state',
        'value': state
      }]
    }]
  };
  ws.send(JSON.stringify(message));
}

//================================================================

function randomizeSequencer(sequencer){
  let state = [];
  for(let i = 0; i < parseInt(sequencer.length); i++){
    const step = document.getElementById(`seq-${sequencer.id}-step-${i}`);
    if (Math.random() > 0.5){
      state.push(1);
      step.checked=true;
    } else {
      state.push(0);
      step.checked=false;
    }
  }
  const message = {
    'type': 'set',
    'targets':[{
      'type': 'sequencer',
      'id': sequencer.id,
      'attributes':[{
        'name': 'state',
        'value': state
      }]
    }]
  };
  ws.send(JSON.stringify(message));
}

//================================================================

function clearSequencer(sequencer){
  let state = [];
  for(let i = 0; i < parseInt(sequencer.length); i++){
    document.getElementById(`seq-${sequencer.id}-step-${i}`).checked = false;
    state.push(0);
  }
  const message = {
    'type': 'set',
    'targets':[{
      'type': 'sequencer',
      'id': sequencer.id,
      'attributes':[{
        'name': 'state',
        'value': state
      }]
    }]
  };
  ws.send(JSON.stringify(message));
}

//================================================================

async function setMasterInterval(tempo){
  const message = {
    'type': 'set',
    'targets':[{
      'type': 'master',
      'attributes':[{
        'name': 'interval',
        'value': 1 / (tempo / 60)
      }]
    }]
  }
  ws.send(JSON.stringify(message));
}
