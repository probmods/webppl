import json
import pymc
import numpy as np
import matplotlib.pyplot as plt

temp_path = './src/inference/mh-diagnostics/temp'

with open(temp_path + '/trace.json', 'r') as data_file:
    trace = np.array(json.load(data_file))

pymc.Matplot.plot(trace, name='trace', path=temp_path, verbose=0)
scores = pymc.geweke(trace)
pymc.Matplot.geweke_plot(scores, name='gweke', path=temp_path)

plt.show()