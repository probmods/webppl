var fs = require('fs');
var React = require('react');
var ReactDOM = require('react-dom');
var katex = require('katex');

require('webppl-editor');
var CodeEditor = wpEditor.ReactComponent;

require('webppl-viz');

var cx = require('classnames');

var showdown = require('showdown');

var $ = require('jquery');
global.$ = $;
var autosize = require('autosize');
var _ = require('underscore');

// For object with integer keys, return max(keys) + 1 (or 0 if empty)

var nextIntegerKey = function(obj){
  var keys = _.keys(obj).map(function(x){return parseInt(x);});
  if (keys.length) {
    return _.max(keys) + 1;
  } else {
    return 0;
  }
};

var showdownKatex = function() {
  return [
    {
      type: 'lang',
      regex: /~D~D([\s\S]+?)~D~D/gm,
      replace: function(text, group) {
        return katex.renderToString(group);
      }
    }
  ];
};

var converter = new showdown.Converter({ extensions: [showdownKatex] });

var CodeInputBox = React.createClass({

  getInitialState: function(){
    return {hasFocus: false};
  },

  onFocus: function(){
    this.setState({hasFocus: true});
  },

  onBlur: function(){
    this.setState({hasFocus: false});
  },

  render: function(){
    var blockClasses = cx({
      editorBlock: true,
      currentBlock: this.state.hasFocus,
      codeBlock: true
    });
    // TODO: pass onBlur, onFocus to react-codemirror's onFocusChange prop
    return (<div className={blockClasses}>
            <CodeEditor code={this.props.initialCode}
                        onChange={this.props.updateCode} />
            <button className="removeBlock" onClick={this.props.removeMe}>x</button>
            <button className="moveUp" onClick={this.props.moveUp}>▲</button>
            <button className="moveDown" onClick={this.props.moveDown}>▼</button>
           </div>);
  }
});

var MarkdownInputBox = React.createClass({
  getInitialState: function(){
    return {text: this.props.initialText, hasFocus: false};
  },

  setFocus: function(){
    $(ReactDOM.findDOMNode(this)).find("textarea").focus();
  },

  onFocus: function(){
    this.setState({hasFocus: true});
  },

  onBlur: function(){
    this.setState({hasFocus: false});
  },

  handleChange: function(event){
    var text = event.target.value;
    this.setState({text: text});
    this.props.updateText(text);
  },

  render: function(){
    var blockClasses = cx({
      editorBlock: true,
      currentBlock: this.state.hasFocus,
      markdownBlock: true
    });
    return (<div className={blockClasses}>
            <button className="removeBlock" onClick={this.props.removeMe}>x</button>
            <button className="moveUp" onClick={this.props.moveUp}>▲</button>
            <button className="moveDown" onClick={this.props.moveDown}>▼</button>
            <textarea onChange={this.handleChange} onFocus={this.onFocus} onBlur={this.onBlur} value={this.state.text}></textarea>
            <div className="preview" onClick={this.setFocus} dangerouslySetInnerHTML={{ __html: converter.makeHtml(this.state.text) }} />
            </div>);
  },

  componentDidMount: function(){
    autosize($(".editorBlock textarea"));
    this.props.updateText(this.state.text);
  },

  componentDidUpdate: function(){
    $(".editorBlock textarea").trigger('autosize:update');
  },

  shouldComponentUpdate: function(nextProps, nextState){
    return (nextState.text != this.state.text) || (nextState.hasFocus != this.state.hasFocus);
  }
});


var getOrderedBlockList = function(originalBlocks){

  // Deep-copy blocks state
  var blocks = $.extend(true, {}, originalBlocks);

  // Add id to block data
  for (var id in blocks){
    blocks[id].id = id;
  }

  // Sort by ordering key
  var blockList = _.values(blocks);
  var orderedBlockList = _.sortBy(blockList, function(block){return block.orderingKey;});

  return orderedBlockList;
};


var MarkdownOutputBox = React.createClass({

  getInitialState: function(){
    return {lastUpdate: (new Date()).getTime()};
  },

  shouldComponentUpdate: function(nextProps, nextState){
    return (((new Date()).getTime() - this.state.lastUpdate) > 500) && (nextProps != this.props);
  },

  render: function(){

    if (!this.props.open){
      return <div></div>;
    }

    // get ordered list of blocks
    var orderedBlocks = getOrderedBlockList(this.props.blocks);

    // generate markdow
    var generatedMarkdown = "";
    orderedBlocks.map(function(block){
      var content = $.trim(block.content);
      if (block.type === "code"){
        generatedMarkdown += "\n\n~~~~\n" + content + "\n~~~~";
      } else if (block.type === "text"){
        generatedMarkdown += "\n\n" + block.content;
      } else {
        console.error("Unknown block type: ", block.type);
      }
    });
    return <textarea id="editorMarkdown" value={$.trim(generatedMarkdown)}></textarea>;
  },

  componentDidMount: function(){
    autosize($('#editorMarkdown'));
  },

  componentDidUpdate: function(){
    $("#editorMarkdown").trigger('autosize:update');
  }

});

var FileSelector = React.createClass({

  handleChange: function(event){
    var selectedFile = event.target.value;
    if (selectedFile === 'new'){
      this.props.createFile();
    } else {
      this.props.loadFile(selectedFile);
    }
  },

  render: function(){
    // $("title").text("Editor: " + this.props.fileIdsWithNames[ parseInt(this.props.selectedFile) ].name);
    return (<div id='fileSelector'>
              <span>File:</span>
              <select value={this.props.selectedFile} onChange={this.handleChange}>
                {this.props.fileIdsWithNames.map(function(idWithName){
                  return <option key={idWithName.id} value={idWithName.id}>{idWithName.name}</option>;
                })}
              <option key="__new__" value="new">New file</option>
              </select>
              {this.props.selectedFile != 0 ?
               [<button key='file-rename' onClick={this.props.renameFile}>rename</button>,
                <button key='file-delete' onClick={this.props.deleteFile}>delete</button>] :
               []}
           </div>);
  }

});


var LiterateEditor = React.createClass({

  getInitialState: function(){
    var localState = localStorage.getItem("WebPPLEditorState");
    if (localState === null){
      // block ids are separate from ordering indices (and only happen to coincide here)
      return {
        selectedFile: 0,
        markdownOutputOpen: false,
        files: {
          0 : {
            name: 'Default',
            blocks: {
              1: {type: "text", content: "*Click here* to edit me!", orderingKey: 1},
              2: {type: "code", content: 'print("hello world!")', orderingKey: 2}
            }
          }
        }
      };
    } else {
      var parsedState = JSON.parse(localState);
      if (parsedState.blocks){
        // deprecated single-file version of LocalStorage - convert to
        // multi-file version
        return {
          selectedFile: 0,
          markdownOutputOpen: false,
          files: {
            0 : {
              name: 'Default',
              blocks: parsedState.blocks
            }
          }
        };
      }
      parsedState.markdownOutputOpen = false;
      return parsedState;
    }
  },

  componentDidUpdate: function(prevProps, prevState) {
    localStorage.WebPPLEditorState = JSON.stringify(this.state);
    // FIXME: with many files, this will get very slow?
  },


  // File handling

  nextFileId: function(){
    return nextIntegerKey(this.state.files);
  },

  loadFile: function(file){
    if (file in this.state.files){
      this.setState({
        selectedFile: file
      });
    }
  },

  renameFile: function(){
    if (this.state.selectedFile == 0){
      alert('Cannot rename default file!');
    } else {
      var currentName = this.state.files[this.state.selectedFile].name
      var newName = window.prompt("Rename '" + currentName + "' to?", "");
      if (newName){
        var newFiles = _.clone(this.state.files);
        newFiles[this.state.selectedFile] = _.clone(this.state.files[this.state.selectedFile]);
        newFiles[this.state.selectedFile].name = newName;
        this.setState({
          files: newFiles
        });
      }
    }
  },

  deleteFile: function(){
    if (this.state.selectedFile == 0){
      alert('Cannot delete default file!');
    } else {
      var newFiles = _.clone(this.state.files);
      delete newFiles[this.state.selectedFile];
      this.setState({
        files: newFiles,
        selectedFile: 0
      });
    }
  },

  createFile: function(){
    // pop up alert box, ask for filename
    var newFileId = this.nextFileId();
    var newFileName = window.prompt("New file name?", "");
    // check that files doesn't exist already
    if (!newFileName || (newFileName.trim() === '')){
      alert('Filename empty!');
      return;
    }
    if (newFileName in _.keys(this.state.files)){
      alert('File ' + newFileName + ' already exists!');
      return;
    }
    // create empty file in state
    // and set new filename as current filename
    newFiles = _.clone(this.state.files);
    newFiles[newFileId] = { name: newFileName, blocks: {} };
    this.setState({
      selectedFile: newFileId,
      files: newFiles
    });
  },


  // Block handling

  updateBlocks: function(blocks){
    var newFiles = _.clone(this.state.files);
    newFiles[this.state.selectedFile] = _.clone(this.state.files[this.state.selectedFile]);
    newFiles[this.state.selectedFile].blocks = blocks
    this.setState({
      files: newFiles
    });
  },

  currentBlocks: function(){
    return this.state.files[this.state.selectedFile].blocks;
  },

  nextBlockId: function(){
    return nextIntegerKey(this.currentBlocks());
  },

  nextOrderingKey: function(){
    var keys = _.values(this.currentBlocks()).map(function(block){return block.orderingKey;});
    if (keys.length) {
      return _.max(keys) + 1;
    } else {
      return 0;
    }
  },

  addBlock: function(type, content){
    var newBlocks = _.clone(this.currentBlocks());
    var newBlock = {
      type: type,
      content: content,
      orderingKey: this.nextOrderingKey()
    };
    newBlocks[this.nextBlockId()] = newBlock;
    this.updateBlocks(newBlocks);
  },

  addCodeBlock: function(){
    this.addBlock("code", "");
  },

  addTextBlock: function(){
    this.addBlock("text", "*Click here* to edit me!");
  },

  updateBlockContent: function(blockId, content){
    var newBlocks = _.clone(this.currentBlocks());
    var updatedBlock = _.clone(this.currentBlocks()[blockId]);
    updatedBlock.content = content;
    newBlocks[blockId] = updatedBlock;
    this.updateBlocks(newBlocks);
  },

  removeBlock: function(blockId){
    var newBlocks = _.clone(this.currentBlocks());
    delete newBlocks[blockId];
    this.updateBlocks(newBlocks);
  },

  moveBlock: function(blockId, direction){
    // Get ordered list of blocks (with ids)
    var orderedBlockList = getOrderedBlockList(this.currentBlocks());

    // Figure out where blockId is in that list
    var i = _.findIndex(orderedBlockList, function(block){return block.id == blockId;});

    // Swap orderingKey with node before/after
    if (direction == "up"){
      if (i > 0) {
        var tmp = orderedBlockList[i - 1].orderingKey;
        orderedBlockList[i - 1].orderingKey = orderedBlockList[i].orderingKey;
        orderedBlockList[i].orderingKey = tmp;
      }
    } else if (direction == "down") {
      if (i < (orderedBlockList.length - 1)) {
        var tmp = orderedBlockList[i + 1].orderingKey;
        orderedBlockList[i + 1].orderingKey = orderedBlockList[i].orderingKey;
        orderedBlockList[i].orderingKey = tmp;
      }
    } else {
      console.error("Unknown direction", direction);
    }

    // Create new blocks, and set state
    var newBlocks = {};
    orderedBlockList.map(function(block){
      var id = block.id;
      delete block.id;
      newBlocks[id] = block;
    });

    this.updateBlocks(newBlocks);
  },

  toggleMarkdownOutput: function(){
    var newMarkdownOutputOpen = !this.state.markdownOutputOpen;
    this.setState({markdownOutputOpen: newMarkdownOutputOpen});
    if (newMarkdownOutputOpen){
      setTimeout(function(){autosize($('#editorMarkdown'));}, 500);
    }
  },
  toggleSize: function() {
    this.setState({maximized: !this.state.maximized})
  },
  render: function() {
    var that = this;
    var fileIdsWithNames = [];
    _.pairs(this.state.files).forEach(function(filePair){
      fileIdsWithNames.push({
        id: filePair[0],
        name: filePair[1].name
      });
    });
    var orderedBlocks = getOrderedBlockList(this.currentBlocks());
    var renderedBlocks = [];
    orderedBlocks.map(function(block){
      if (block.type === "text") {
        var renderedBlock = (<MarkdownInputBox initialText={block.content}
                                               updateText={that.updateBlockContent.bind(that, block.id)}
                                               removeMe={that.removeBlock.bind(that, block.id)}
                                               moveUp={that.moveBlock.bind(that, block.id, "up")}
                                               moveDown={that.moveBlock.bind(that, block.id, "down")}
                                               key={that.state.selectedFile + '-' + block.id} />);
      } else if (block.type === "code") {
        var renderedBlock = (<CodeInputBox initialCode={block.content}
                                           updateCode={that.updateBlockContent.bind(that, block.id)}
                                           removeMe={that.removeBlock.bind(that, block.id)}
                                           moveUp={that.moveBlock.bind(that, block.id, "up")}
                                           moveDown={that.moveBlock.bind(that, block.id, "down")}
                                           key={that.state.selectedFile + '-' + block.id} />);
      } else {
        console.error("Unknown block type: ", block.type);
      }
      renderedBlocks.push(renderedBlock);
    });

    if (this.state.maximized) {
      $(".jumbotron, .marketing, .footer").hide()
      $(".panel, .header").addClass('maximized')
    } else {
      $(".header, .jumbotron, .marketing, .footer").show()
      $(".panel, .header").removeClass('maximized')
    }
    var sizeButtonText= this.state.maximized ? '⇙' : '⇗';
    return (<div className='literate-editor'>

            <div id="editorControls">
            <FileSelector fileIdsWithNames={fileIdsWithNames}
            selectedFile={this.state.selectedFile}
            loadFile={this.loadFile}
            createFile={this.createFile}
            deleteFile={this.deleteFile}
            renameFile={this.renameFile} />
            <button className="btn btn-default" onClick={this.addCodeBlock}>add code</button>
            <button className="btn btn-default hidden-xs" onClick={this.addTextBlock}>add text</button>
            <button className="btn btn-default hidden-xs" onClick={this.toggleMarkdownOutput}>.md</button>
            <button className="btn btn-default hidden-xs maximize" onClick={this.toggleSize}>{sizeButtonText}</button>
            </div>
        <div id="editorBlocks">
          {renderedBlocks}
        </div>
        <MarkdownOutputBox blocks={this.currentBlocks()} open={this.state.markdownOutputOpen}/>
      </div>);
  }
});

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
          1: {type: "code", content: fs.readFileSync(__dirname + '/../examples/geometric.wppl', 'utf8'), orderingKey: 1}
        }
      },
      1: {
        name: 'Linear Regression',
        blocks: {
          1: {type: "code", content: fs.readFileSync(__dirname + '/../examples/linear-regression.wppl', 'utf8'), orderingKey: 1}
        }
      },
      2: {
        name: 'Logistic Regression',
        blocks: {
          1: {type: "code", content: fs.readFileSync(__dirname + '/../examples/logistic-regression.wppl', 'utf8'), orderingKey: 1}
        }
      },
      3: {
        name: 'Scalar Implicature',
        blocks: {
          1: {type: "code", content: fs.readFileSync(__dirname + '/../examples/scalar-implicature.wppl', 'utf8'), orderingKey: 1}
        }
      },
      4: {
        name: 'Hidden Markov Model',
        blocks: {
          1: {type: "code", content: fs.readFileSync(__dirname + '/../examples/hmm.wppl', 'utf8'), orderingKey: 1}
        }
      }
    }
  };
  localStorage.WebPPLEditorState = JSON.stringify(initState);
}


$(function() {
var editorContainer = document.getElementById('reactEditor');

if (editorContainer){
  ReactDOM.render(<LiterateEditor />, editorContainer)
}

});


// Bibtex

function setBibtex(){
  $('#toggle-bibtex').click(function(){$('#bibtex').toggle(); return false;});
}

function setDate(){
  var today = new Date();
  var dd = today.getDate();
  var mm = today.getMonth() + 1; //January is 0!
  var yyyy = today.getFullYear();
  $(".date").text(yyyy+'-'+mm+'-'+dd);
}

$(setBibtex);
$(setDate);
