import {ContentSelector} from './content-selector';
import {Animator} from './animator';

// How to inject properly?
var anim = new Animator();

export class ViewSlot {
  constructor(anchor, anchorIsContainer, executionContext){
    this.anchor = anchor;
    this.viewAddMethod = anchorIsContainer ? 'appendNodesTo' : 'insertNodesBefore';
    this.executionContext = executionContext;
    this.children = [];
    this.isBound = false;
    this.isAttached = false;

    anchor.viewSlot = this;

    // how to get a single instance without inject?
    this.animator = anim;
  }

  transformChildNodesIntoView(){
    var parent = this.anchor;

    this.children.push({
      removeNodes(){
        var last;

        while(last = parent.lastChild) {
          parent.removeChild(last);
        }
      },
      created(){},
      bind(){},
      unbind(){},
      attached(){},
      detached(){}
    });
  }

  bind(executionContext){
    var i, ii, children;

    if(this.isBound){
      if(this.executionContext === executionContext){
        return;
      }

      this.unbind();
    }

    this.isBound = true;
    this.executionContext = executionContext = executionContext || this.executionContext;

    children = this.children;
    for(i = 0, ii = children.length; i < ii; ++i){
      children[i].bind(executionContext, true);
    }
  }

  unbind(){
    var i, ii, children = this.children;
    this.isBound = false;

    for(i = 0, ii = children.length; i < ii; ++i){
      children[i].unbind();
    }
  }

  add(view){
    view[this.viewAddMethod](this.anchor);
    this.children.push(view);

    if(view.firstChild.nodeType === 8 &&
      view.firstChild.nextSibling !== undefined &&
      view.firstChild.nextSibling.nodeType === 1) {
      this.animator.enter(view.firstChild.nextSibling);
    }

    if(this.isAttached){
      view.attached();
    }
  }

  insert(index, view){
    if((index === 0 && !this.children.length) || index >= this.children.length){
      this.add(view);
    } else{
      view.insertNodesBefore(this.children[index].firstChild);
      this.children.splice(index, 0, view);

      if(this.isAttached){
        view.attached();
      }
    }
  }

  remove(view){
    view.removeNodes();
    this.children.splice(this.children.indexOf(view), 1);

    if(this.isAttached){
      view.detached();
    }
  }

  removeAt(index){
    var view = this.children[index];

    var removeAction = () => {
      view.removeNodes();
      this.children.splice(index, 1);

      if(this.isAttached){
        view.detached();
      }

      return view;
    };

    if(view.firstChild.nodeType === 8 &&
      view.firstChild.nextElementSibling !== undefined &&
      view.firstChild.nextElementSibling.nodeType === 1) {
      return this.animator.leave(view.firstChild.nextElementSibling).then( () => {
        return removeAction();
      })
    } else {
      return removeAction();
    }
  }

  removeAll(){
    var children = this.children,
      ii = children.length,
      i;

    var rmPromises = [];

    children.forEach( (child) => {
      if(child.firstChild !== undefined &&
        child.firstChild.nodeType === 8 &&
        child.firstChild.nextElementSibling !== undefined &&
        child.firstChild.nextElementSibling.nodeType === 1) {
        rmPromises.push(this.animator.leave(child.firstChild.nextElementSibling).then( () => {
          child.removeNodes();
        }));
      } else {
        child.removeNodes();
      }
    });

    var removeAction = () => {
      if(this.isAttached){
        for(i = 0; i < ii; ++i){
          children[i].detached();
        }
      }

      this.children = [];
    };

    if(rmPromises.length > 0) {
      return Promise.all(rmPromises).then( () => {
        removeAction();
      });
    } else {
      removeAction();
    }
  }

  swap(view){
    var removeResponse = this.removeAll();
    if(removeResponse !== undefined) {
      removeResponse.then(() => {
        this.add(view);
      });
    } else {
      this.add(view);
    }
  }

  attached(){
    var i, ii, children;

    if(this.isAttached){
      return;
    }

    this.isAttached = true;

    children = this.children;
    for(i = 0, ii = children.length; i < ii; ++i){
      children[i].attached();
    }
  }

  detached(){
    var i, ii, children;

    if(this.isAttached){
      this.isAttached = false;
      children = this.children;
      for(i = 0, ii = children.length; i < ii; ++i){
        children[i].detached();
      }
    }
  }

  installContentSelectors(contentSelectors){
    this.contentSelectors = contentSelectors;
    this.add = this.contentSelectorAdd;
    this.insert = this.contentSelectorInsert;
    this.remove = this.contentSelectorRemove;
    this.removeAt = this.contentSelectorRemoveAt;
    this.removeAll = this.contentSelectorRemoveAll;
  }

  contentSelectorAdd(view){
    ContentSelector.applySelectors(
      view, 
      this.contentSelectors,
      (contentSelector, group) => contentSelector.add(group)
      );

    this.children.push(view);

    if(this.isAttached){
      view.attached();
    }
  }

  contentSelectorInsert(index, view){
    if((index === 0 && !this.children.length) || index >= this.children.length){
      this.add(view);
    } else{
      ContentSelector.applySelectors(
        view, 
        this.contentSelectors,
        (contentSelector, group) => contentSelector.insert(index, group)
      );

      this.children.splice(index, 0, view);

      if(this.isAttached){
        view.attached();
      }
    }
  }

  contentSelectorRemove(view){
    var index = this.children.indexOf(view),
        contentSelectors = this.contentSelectors,
        i, ii;
    
    for(i = 0, ii = contentSelectors.length; i < ii; ++i){
      contentSelectors[i].removeAt(index, view.fragment);
    }

    this.children.splice(index, 1);

    if(this.isAttached){
      view.detached();
    }
  }

  contentSelectorRemoveAt(index){
    var view = this.children[index],
        contentSelectors = this.contentSelectors,
        i, ii;

    for(i = 0, ii = contentSelectors.length; i < ii; ++i){
      contentSelectors[i].removeAt(index, view.fragment);
    }

    this.children.splice(index, 1);

    if(this.isAttached){
      view.detached();
    }

    return view;
  }

  contentSelectorRemoveAll(){
    var children = this.children,
        contentSelectors = this.contentSelectors,
        ii = children.length,
        jj = contentSelectors.length,
        i, j, view;

    for(i = 0; i < ii; ++i){
      view = children[i];

      for(j = 0; j < jj; ++j){
        contentSelectors[j].removeAt(i, view.fragment);
      }
    }

    if(this.isAttached){
      for(i = 0; i < ii; ++i){
        children[i].detached();
      }
    }

    this.children = [];
  }
}
