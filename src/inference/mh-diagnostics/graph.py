import json
import pymc
import numpy as np
import matplotlib.pyplot as plt
import tempfile

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

def summary(trace, trace_name):
    md = np.median(trace)
    mean = np.mean(trace)
    mn = np.min(trace)
    mx = np.max(trace)
    std = np.std(trace)
    print '{0}\n\t mean: {1},\t std: {2},\t median: {3},\t min: {4},\t max: {5}, '.format(trace_name, mean, std, md, mn, mx)

def plot(temp_path, traces):
    for i in range(len(traces)):
        trace_name = 'trace_' + str(i)
        pymc.Matplot.plot(traces[i], name=trace_name, path=temp_path, verbose=0)
        summary(traces[i], trace_name)
        try:
            scores = pymc.geweke(traces[i])
            pymc.Matplot.geweke_plot(scores, name='gweke_' + str(i), path=temp_path)
        except:
            print 'Failed to create Geweke plot.'

if __name__ == '__main__':
    temp_path = tempfile.gettempdir()
    traces = get_traces(temp_path)
    plot(temp_path, traces)
    plt.show()