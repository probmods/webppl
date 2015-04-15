import json
import pymc
import numpy as np
import matplotlib.pyplot as plt

def get_traces(temp_path):
    with open(temp_path + '/trace.json', 'r') as data_file:
        vals = np.array(json.load(data_file))

    if type(vals[0]) != list:
        vals = [[v] for v in vals]

    traces = np.zeros((len(vals[0]), len(vals)))
    for i in range(len(vals)):
        for j in range(len(vals[i])):
            traces[j][i] = vals[i][j]
    return traces

def plot(temp_path, traces):
    for i in range(len(traces)):
        pymc.Matplot.plot(traces[i], name='trace_' + str(i), path=temp_path, verbose=0)
        scores = pymc.geweke(traces[i])
        pymc.Matplot.geweke_plot(scores, name='gweke_' + str(i), path=temp_path)

if __name__ == '__main__':
    temp_path = './src/inference/mh-diagnostics/temp'
    traces = get_traces(temp_path)
    plot(temp_path, traces)
    plt.show()