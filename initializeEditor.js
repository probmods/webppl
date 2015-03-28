var geometricCode = ['var geometric = function(){',
                     '  return flip(.5) ? 0 : geometric() + 1;',
                     '}',
                     '',
                     'var conditionedGeometric = function(){',
                     '  var x = geometric();',
                     '  factor(x > 2 ? 0 : -Infinity);',
                     '  return x;',
                     '}',
                     '',
                     'print(Enumerate(conditionedGeometric, 10))'].join('\n');

var localState = localStorage.getItem("WebPPLEditorState");

if (localState === null){
  // block ids are separate from ordering indices (and only happen to coincide here)  
  var initState = {
    selectedFile: 0,
    markdownOutputOpen: false,
    files: {
      0 : {
        name: 'Default',
        blocks: {
          1: {type: "code", content: geometricCode, orderingKey: 1}
        }
      }
    }
  };
  localStorage.WebPPLEditorState = JSON.stringify(initState);
}
