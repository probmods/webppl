var fs = require('fs');
var util = require('../src/util.js');

// This might choke on really big files.
function getFileLines(filename) {
	return fs.readFileSync(filename).toString().split('\n');
}

function loadVocab(filename) {
	return getFileLines(filename);
}

function loadDocwords(filename) {
	var lines = getFileLines(filename);
	var numDocs = lines[0];
	var documents = [];
	for (var i = 0; i < numDocs; i++)
		documents.push([]);
	lines = lines.slice(3);
	for (var i = 0; i < lines.length; i++) {
		var line = lines[i];
		if (line.length > 0) {
			var toks = line.split(' ');
			var doc = (+toks[0]) - 1;
			var word = (+toks[1]) - 1;
			var num = +toks[2];
			documents[doc].push([word, num]);
		}
	}
	return documents;
}

// For now, just deterministically take the first n
function subsample(documents, vocab, n) {
	var newdocs = documents.slice().splice(0, n);
	// Compact the word indices.
	// Also compute the new, reduced vocab as we go.
	var wordIndexMap = {};
	var currIdx = 0;
	var newvocab = [];
	for (var i = 0; i < newdocs.length; i++) {
		var doc = newdocs[i];
		for (var j = 0; j < doc.length; j++) {
			var wordEntry = doc[j];
			var wordIdx = wordEntry[0];
			var newIdx = wordIndexMap[wordIdx];
			if (newIdx === undefined) {
				newIdx = currIdx++;
				wordIndexMap[wordIdx] = newIdx;
				newvocab.push(vocab[wordIdx]);
			}
			wordEntry[0] = newIdx;
		}
	}
	return [newdocs, newvocab];
}

function loadData(datasetname, directory, nSubsample) {
	directory = directory || '.';
	var vocabfilename = directory + '/vocab.' + datasetname + '.txt';
	var docwordsfilename = directory + '/docword.' + datasetname + '.txt';
	var vocab = loadVocab(vocabfilename);
	var docwords = loadDocwords(docwordsfilename);
	if (nSubsample !== undefined)
		var rets = subsample(docwords, vocab, nSubsample);
		docwords = rets[0];
		vocab = rets[1];
	return { vocab: vocab, documents: docwords };
}

function genSynthData(nDocs, nWords, nWordsPerDoc) {
	var gensym = util.makeGensym();
	var vocab = [];
	for (var i = 0; i < nWords; i++)
		vocab.push(gensym('word'));
	var docs = [];
	for (var i = 0; i < nDocs; i++) {
		var doc = [];
		var wordsLeft = nWordsPerDoc;
		var wordsToChoose = [];
		for (var j = 0; j < nWords; j++)
			wordsToChoose.push(j);
		while (wordsLeft > 0) {
			var wordIdx = Math.floor(Math.random() * wordsToChoose.length);
			var word = wordsToChoose[wordIdx];
			wordsToChoose.splice(wordIdx, 1);
			var n = Math.ceil(Math.random()*wordsLeft);
			wordsLeft -= n;
			doc.push([word, n]);
		}
		docs.push(doc);
	}
	return {vocab: vocab, documents: docs};
}

function summarizeWordDistrib(wordDistrib, vocabulary, n) {
	var distWithIndices = [];
	for (var i = 0; i < wordDistrib.length; i++)
		distWithIndices.push([i, wordDistrib[i]]);
	distWithIndices.sort(function(a, b) { return b[1] - a[1]; });
	return distWithIndices.splice(0, n).map(function(x) {
		return [vocabulary[x[0]], x[1]];
	});
}

module.exports = {
	loadData: loadData,
	genSynthData: genSynthData,
	summarizeWordDistrib: summarizeWordDistrib
};
