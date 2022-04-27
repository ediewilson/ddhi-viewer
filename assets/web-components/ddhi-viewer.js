/**
 *  Prototype for the DDHI Viewer Web Application
 *
 *  The DDHI Viewer is a series of visualizations that display data retrieved from a
 *  DDHI Oral History Repository. It is intended to be modular, allowing you to build
 *  visualizations and information displays as individual Web Components.
 *
 */


/**
 *  User-facing custom elements.
 *  These elements will allow users to define the parameters of their DDHI Viewer.
 */

/**
 *  DDHIViewHelper.
 *  A plugin that provides presentation tools for DDHI Web Components.
 *  It must be passed the viewer object.
 */


 class DDHIViewHelper {
  constructor(viewer) {
    this.viewer = viewer;
    this.heartbeat = 800/5; // Used for animations
  }
  // @method connectedCallback()
  // @description Initializer method for this component.


  connectedCallback() {
  }

  // Font canÅt be loaded directly into the ShadowDOM, they can
  // only be inherited from the page itself.
  // This can be called from any object via a Viewhelper instance.

  loadDDHIFonts() {

    if(document.querySelector('head') !== null) {
      var headElement = document.querySelector('head');

      if (headElement.querySelector("[title='DDHI Viewer Fonts']") === null) {
        var link = document.createElement('link');
        link.setAttribute('title','DDHI Viewer Fonts');
        link.setAttribute('rel','stylesheet');
        link.setAttribute('href','https://fonts.googleapis.com/css?family=Roboto|Aleo');
        headElement.appendChild(link);
      }
    }

  }

  fadeOut(fadeTarget,display='grid') {
    var fadeEffect = setInterval(function () {
      if (!fadeTarget.style.opacity) {
        fadeTarget.style.opacity = 1;
      }
      if (fadeTarget.style.opacity > 0) {
        fadeTarget.style.opacity -= 0.1;
      } else {
        clearInterval(fadeEffect);
        fadeTarget.style.display = 'none';
      }
    }, 200);
  }

  fadeIn(fadeTarget,display='grid') {
    fadeTarget.style.opacity = 0;
    fadeTarget.style.display = display;

    var fadeEffect = setInterval(function () {
      if (!fadeTarget.style.opacity) {
        fadeTarget.style.opacity = 0;
      }
      if (fadeTarget.style.opacity < 1) {
        fadeTarget.style.opacity += 0.1;
      } else {
        clearInterval(fadeEffect);
      }
    }, 200);
  }

}


/**
 *  DDHIDataComponent.
 *  The base  DDHI Data Component manages data access for visualizations and information \
 *  panels.
 */


class DDHIDataComponent extends HTMLElement {
  constructor() {
    super();
    this.repositoryURI; // Set from the ddhi-viewer repository attribute
    this.apiURI; // Derived from above
    this.cdnAssetPath = 'modules/custom/ddhi_rest/assets/ddhi-viewer'; // Derived from above
    this.viewer; // The active viewer
    this.viewHelper; // An instance of the DDHI View Plugin
    this.loading = false;
    this.availableIds = []; // Available data ids for this visualization
    this.activeIds = []; // A list of active data ids
    this.items = {};  // Data keyed by ID.
    this.tempResult; // Holding property for asynchronous data retrieval.
    this.supportedEntityTypes = ['events','persons','places','organizations', 'dates']; // Currently supported entities types.
    this.mentionedEntities = {}; // The list of entities mentioned in a transcript.
    this.wikidataAPIUrl = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&languages=en&sitefilter=enwiki';
    this.eventData;
    this.eventDateIndex; // Indexes event dates by id.
    this.multiInterview = {}; // multi interview entity holder
  }

  // @method connectedCallback()
  // @description Initializer method for this component.


  connectedCallback() {

    this.loadViewerObject();


    if (typeof this.viewer !== 'undefined' && this.viewer !== 'null') {
      this.repositoryURI = this.viewer.getAttribute('repository');
      this.apiURI = this.repositoryURI + '/ddhi-api';
      this.viewHelper = new DDHIViewHelper(this.viewer);
    }
  }

  // @method getAPIResource()
  // @description A general purpose utility for retrieving data from the repository.
  // @param resource The REST endpoint to retrieve data from, as path from REST URI
  // @param prop The property to populate with results.
  // @param format The format of the response. Supports xml and the default json.

  async getAPIResource(resource,prop,format='json') {

    const response = await fetch(this.apiURI + '/' + resource + '?_format=' + format, {mode: 'cors'});
    const result = await response.json();

    if (!response.ok) {
      const message = `An error has occured: ${response.status}`;
      throw new Error(message);
    }

    this[prop] = result;

    return response;

  }

  // @method getWikiData()
  // @description A general purpose utility for retrieving data from the Wikidata API.
  //   see https://www.wikidata.org/w/api.php?action=help&modules=wbgetentities
  // @param qids An array of qids to submit
  // @param props The properties to retrieve. Defaults to 'sitelinks/urls'.
  //
  // @return The result object
  // NOTE: The maximum number of qids that can be retrieved in one query is 50.

  async getWikiData(qids=[],props=['sitelinks/urls','claims']) {

    if (qids.length > 50) {
      console.log('Maximum number of Wikidata ids exceeded.');
    }

    // Note &origin=* parameter required for MediaWiki/Wikidata requests

    const response = await fetch(this.wikidataAPIUrl + '&origin=*' + '&props=' + props.join('|') + '&ids=' + qids.join('|'), {mode: 'cors'});

    //const response = await fetch(this.wikidataAPIUrl + '&props=' + props.join('|') + '&ids=' + qids.join('|'));
    const result = await response.json();


    if (!response.ok) {
      const message = `An error has occured: ${response.status}`;
      throw new Error(message);
    }

    return result;

  }

  /**
   *  @function getEventData()
   *  @description Retrives event data for all event entities from WikiData.
   *    Date data populates this.eventDateIndex property.
   *    this.eventDateIndex is keyed by QID, each an object with five properties. Each can be null if empty:
   *      startDate: The claimed start date. (Wikidata Property P580)
   *      endDate: The claimed end date. (Wikidata Property P582)
   *      pointInTime: The date of event if not a range (Wikidate Property P585)
   *      sortDateStart: Merging of startDate and pointInTime for sorting.
   *      sortDateEnd:  Merging of endDate and pointInTime for sorting.
   */

  async getEventData() {

    this.eventDateIndex = {};
// todo : fix for multi
    var response = await this.getAssociatedEntitiesByType(this,'multiInterview',this.getActiveIdFromAttribute());
    var qids = [];
    var id = this.getActiveIdFromAttribute();
    const ids = id.split(',')
    await Promise.all(ids.map(async (id) => {
      this.eventData = this.multiInterview[id].events
      for (var i=0;i<this.eventData.length;i++) {
        if (typeof this.eventData[i] !== "undefined" && this.eventData[i].qid)
          qids.push(this.eventData[i].qid);
      }
  
      if (qids.length > 0) {
        var wikiDataEvents = await this.getWikiData(qids);
  
  
  
        for (var qid in wikiDataEvents.entities) {
          var claims = wikiDataEvents.entities[qid].claims; // Information claims from Wikidata... in other words the metadata
  
          this.eventDateIndex[qid] = {
            startDate: claims.hasOwnProperty('P580') ? claims.P580[0].mainsnak.datavalue.value.time : null,
            endDate: claims.hasOwnProperty('P582') ? claims.P582[0].mainsnak.datavalue.value.time : null,
            pointInTime: claims.hasOwnProperty('P585') ? claims.P585[0].mainsnak.datavalue.value.time: null,
          }
  
          this.eventDateIndex[qid].sortDateStart = this.eventDateIndex[qid].startDate ? this.eventDateIndex[qid].startDate : this.eventDateIndex[qid].pointInTime;
          this.eventDateIndex[qid].sortDateEnd = this.eventDateIndex[qid].endDate ? this.eventDateIndex[qid].endDate : this.eventDateIndex[qid].pointInTime;
        }
      }
    }))
    
    return response;
  }



  // @method loadViewerObject()
  // @description A hack. The entity web component is returning null when inserted
  //  programatically. So a method exists to inject the viewer object externally
  //  and skip tracing it through the DOM.
  // @todo Fix this. It's likely a logic error somewhere.


  loadViewerObject(rebuild=false) {
    if (typeof this.viewer == 'undefined') {
      this.viewer = this.closestElement('ddhi-viewer'); // can be null
    }
  }

  injectViewerObject(viewer) {
    this.viewer = viewer;
    this.viewHelper = new DDHIViewHelper(this.viewer);
  }

  propagateSelectedEntity(id) {
    this.propagateAttributes('selected-entity',id);
  }

  // @method propagateAttributes()
  // @description Propagates an attribute to the root elements of all
  //   visualizations and panel components. This is the core of the communication
  //   system between panels, as it allows a component to trigger another component's
  //   attributeChanged function and supply a value for local handling.
  //

  propagateAttributes(attr,value) {

    // Propagate to all elements in the visualizations block

    if (this.viewer.visualizations.length > 0) {
      this.viewer.visualizations.forEach(function(element){
        element.setAttribute(attr,value);

      })
    }

    // Propagate to all elements in the Information block

    if (this.viewer.infoPanels.length > 0) {
      this.viewer.infoPanels.forEach(function(element){
        element.setAttribute(attr,value);
      })
    }

    // Propagate to all elements marked with a Å„propagateÃ® attribute

    this.viewer.shadowRoot.querySelectorAll('[propagate]').forEach(function(element){
      element.setAttribute(attr,value);
    });

    // Propagate to the viewer itself

    this.viewer.setAttribute(attr,value);
  }

  // @method removePropagatedAttributes()
  // @description Removes an attribute from all propagated elements

  removePropagatedAttributes(attr) {

    // Propagate to all elements in the visualizations block

    if (this.visualizations.length > 0) {
      this.visualizations.forEach(function(element){
        element.removeAttribute(attr);

      })
    }

    // Propagate to all elements in the Information block

    if (this.infoPanels.length > 0) {
      this.infoPanels.forEach(function(element){
        element.removeAttribute(attr);
      })
    }

    // Propagate to all elements marked with a Å„propagateÃ® attribute

    this.shadowRoot.querySelectorAll('[propagate]').forEach(function(element){
      element.removeAttribute(attr);
    });

    // Propagate to the viewer itself

    this.removeAttribute(attr);
  }

  // @method getTranscripts()
  // @description Retrieves transcripts from the repository.


  async getTranscripts() {
    return this.getAPIResource('collections/transcripts','availableIds');
  }

  // @method getItemDataById()
  // @description Fetches the data for a particular item id (e.g. a transcript) and
  //   populates the "items" property. Active Ids are set elsewhere and are stored as
  //   attributes in the component's host element. Logic exists to support multiple
  //   active items if that becomes part of a future specification.

  async getItemDataById() {
    var component = this;

    this.itemsDataReset();

    var activeId = this.getActiveIdFromAttribute();
    var res = []
    if (activeId !== null) {
      const ids = activeId.split(",");
     // console.log('active id in get item data', ids)
      // TODO: Getting multi interview data
      await Promise.all(ids.map(async (id) => {
        component.tempResult = null;
        var response = await component.getAPIResource('items/' + id,'tempResult');
        this.itemsDataSetItem(id, component.tempResult);
        component.tempResult = null;
        //console.log('item response', response)
        res.push(response)
      }));
    
    //console.log('res list: ', res)
    // TODO: return all
    return res;
    }
  }

  // @method getAssociatedEntitiesByType()
  // @description Retrieves all Entities associated with an entry and filtered by entity
  //   type. For instance, this can be used to retrieve all places mentioned in a transcript.
  // @param storeObject An object to assign the value
  // @param property The property of that object to assign the value (property name as string)
  // @param id The id of the entity
  // @param type The type of entity to cross reference. Accepts
  //   events|locations|people|places|transcripts
// TODO: Makes an object mapping id to dict of all entities - make use of this in the map tool 
  async getAssociatedEntitiesByType(storeObject,property,id=null,type='people') {
    var component = this;

    if(id==null) {
      var id = this.getActiveIdFromAttribute();
    }
    var res = []
    if (id !== null) {
      const ids = id.split(",");
      // console.log('active id in get associated entity data', ids)
      // console.log('entity list in associated entity before: ', this.multiInterview)

      // TODO: Getting multi interview data
      await Promise.all(ids.map(async (id) => {
        component.tempResult = null;
        var response = await component.getAPIResource("items/" + id + "/" + type,'tempResult');
        //storeObject[property] = component.tempResult; // assign by reference
        // console.log('id', id, 'property', property, 'temp result', component.tempResult)
        if(!this.multiInterview.hasOwnProperty(id)) {
          var color = Math.floor(Math.random()*16777215).toString(16);
          color = '#' + color;
          var border = this.shadeColor(color)
          
          this.multiInterview[id] = {
            "dates": [],
            "events": [],
            "organizations":  [],
            "persons": [],
            "places": [],
            "tei_uri": "",
            "title": "",
            "transcript": "",
            "uri": "",
            'color': "",
            'border': ''
          } 
          
          for(const key in this.multiInterview[id]) {
            this.multiInterview[id][key] = component.tempResult[key]
          }
          this.multiInterview[id].color = color;
          this.multiInterview[id].border = border;
            //storeObject[property] = this.multiInterview
          
        }
        // if(property === 'multiInterview' || property === '') {
        //   for(const key in this.multiInterview[id]) {
        //     this.multiInterview[id][key] = component.tempResult[key]
        //   }
        storeObject[property] = this.multiInterview
        // }
        res.push(response)
      }));
    storeObject[property] = this.multiInterview
    // console.log('entity list in associated entity after: ', this.multiInterview)
    // // TODO: return all
    return res;
    }
  }

  // @method itemsDataReset()
  // @description Resets the object's active items data property. This property
  // stores the full item object (i.e. a transcript)

  itemsDataReset() {
    this.items = {};
  }

  // @method itemsDataSetItem()
  // @description Sets the object's active item data property. This property
  //   stores the full item object (i.e. a transcript) keyed by id. Note that
  //   it does not retrieve remote data, it's just a setter.

  itemsDataSetItem(id,data) {
    this.items[id] = data;
  }

  // @method getItemData()
  // @description Returns a single item from the itemData property.

  getItemData() {
    var item = {};

    for (const prop in this.items) {
      item = this.items[prop];
    }

    return item;
  }

   shadeColor(color) {
      var percent = -25;
      var R = parseInt(color.substring(1,3),16);
      var G = parseInt(color.substring(3,5),16);
      var B = parseInt(color.substring(5,7),16);

      R = parseInt(R * (100 + percent) / 100);
      G = parseInt(G * (100 + percent) / 100);
      B = parseInt(B * (100 + percent) / 100);

      R = (R<255)?R:255;  
      G = (G<255)?G:255;  
      B = (B<255)?B:255;  

      var RR = ((R.toString(16).length==1)?"0"+R.toString(16):R.toString(16));
      var GG = ((G.toString(16).length==1)?"0"+G.toString(16):G.toString(16));
      var BB = ((B.toString(16).length==1)?"0"+B.toString(16):B.toString(16));

      return "#"+RR+GG+BB;
  }
  // @method getActiveIdFromAttribute()
  // @description Retrieves the current active ID from the componentÃs ddhi-active-id  attribute.
  // @return A single active ID. Null if no ID is present.

  getActiveIdFromAttribute() {
    return this.getAttribute('ddhi-active-id');
  }

  // @method setData()
  // @description Attach arbitrary data to this element.

  setData(prop,data) {
    this[prop] = data;
  }

  // @method closestElement()
  // @description Handy utility function courtesy of
  //   https://stackoverflow.com/questions/54520554/custom-element-getrootnode-closest-function-crossing-multiple-parent-shadowd

  closestElement(selector, base = this) {
    function __closestFrom(el) {
      if (!el || el === document || el === window) return null;
      let found = el.closest(selector);
      if (found)
        return found;
      else
        __closestFrom(el.getRootNode().host);
    }

    return __closestFrom(base);
  }

  // @method getMentionedEntities()
  // @description Retrieves the entities mentioned in an item.
  //  cross references them with actual mentions in the transcript to get
  //  ordinal information. The result is a flat set of entity objects.

  getMentionedEntities(item=null,setProperty=true) {
    var component = this;

    if (item==null) {
      item = this.getItemData();
    }

    var mentionedEntities = {};

    this.supportedEntityTypes.forEach(function(e,i){
      if (item.hasOwnProperty(e)) {
        item[e].forEach(function(entity) {
          if(!entity.title){
            entity.title = entity.when;
            entity.resource_type = 'date';
          }
          mentionedEntities[entity.id] = entity;
        });
      }
    });

    if (setProperty==true) {
      this.mentionedEntities = mentionedEntities;
    }
    return mentionedEntities;
  }

  // @method getEntitiesByOrderOfMention()
  // @description Returns an array of entity ids in the order that they appear in the
  //  transcript. Entity details can then retrieved from the mentionedEntities property.

  getEntitiesByOrderOfMention(item=null) {
    if (item==null) {
      item = this.getItemData();
    }

    var orderedEntities = [];

    // Thank you https://davidwalsh.name/convert-html-stings-dom-nodes !

    let transcript = document.createRange().createContextualFragment(item.transcript);

    transcript.querySelectorAll('span, date').forEach(function (e){
      if (e.hasAttribute('data-entity-id')) {
        orderedEntities.push(e.getAttribute('data-entity-id'));
      }
      else if (e.hasAttribute('id')) {
        
        orderedEntities.push(e.getAttribute('id'));
        // e.setAttribute('data-entity-id', e.getAttribute('when'))
        // orderedEntities.push(e.getAttribute('data-entity-id'));
      }
    });
    return orderedEntities;
  }



  // @method renderValue()
  // @description View Helper that empties a target element of text and populates
  //   it with a new value.
  // @param element  The target element
  // @param value The replacement value


  renderValue(element,value) {
    // Check that element exists.
    if (typeof element == 'undefined') {
      return;
    }
    element.textContent = "";
    var wrapper = document.createElement('div');
    wrapper.innerHTML = value;
    element.appendChild(wrapper.firstChild);
  }
}



/**
 *  DDHIVisualization.
 *  A base class for visualizations.
 */

class DDHIVisualization extends DDHIDataComponent {
  constructor() {
    super();
  }

  // @method connectedCallback()
  // @description Initializer method for this component.

  connectedCallback() {
    super.connectedCallback();
  }

}

/**
 *  DDHIVisualization.
 *  A base class for information panels.
 */


class DDHIInfoPanel extends DDHIDataComponent {
  constructor() {
    super();
  }

  // @method connectedCallback()
  // @description Initializer method for this component.

  connectedCallback() {
    super.connectedCallback();
    this.viewHelper.loadDDHIFonts();
  }

}



/**
 *  ddhi-entity-browser element.
 *  Basic visualization for the entity browser. Will also serve as a model for other
 *  visualizations
 */

customElements.define('ddhi-entity-browser', class extends DDHIVisualization {
  constructor() {
    super();
    this.resetIndices();

    // Attach a shadow root to <ddhi-entity-browser>.
    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = `
      <style>
        :host {
          overflow: hidden;
          height: 100%;
        }

        * {
          transition: opacity 0.2s;
        }

        .visualization {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 100%;
          overflow: auto;

        }

        .controls, .labels {
          height: 5rem;
          padding-bottom: var(--ddhi-viewer-padding, 1rem)
        }

        .controls {
          display: flex;
          flex-direction: row;
          justify-content: flex-start
        }

        .controls > * {
          margin-right: var(--ddhi-viewer-padding, 1rem)
        }

        .entity-grid {
          flex-shrink: 1;
          flex-grow: 1;
          display: flex;
          flex-direction: row;
          justify-content: flex-start;
          align-items: flex-start;
          flex-wrap: wrap;
          overflow-y: scroll;
          height: 100%;
        }

        .devnote {
          font-size: 0.75rem;
          color: #99A2A3;
        }

        metadata-field {
          display: inline-block;
          margin-right: 1rem;
        }

        .metadata-field .label {
          text-transform: uppercase;
          font-size: 0.75rem;
          color: #919293;
          font-weight: 800;
          display: inline-block;
          margin-right: 0.25rem;
        }

        .metadata-field .value {
          font-size: 0.75rem;
          color: #4F5152;
        }

        .formlabel {
          color: #99A2A3;
          font-size: 0.75rem;
        }

        select {
          -webkit-appearance: none;
          -webkit-border-radius: 0;
          border-width: 0 0 2px 0;
          border-bottom-color: #9BC8EB;
          height: 2rem;
          width: 15rem;
          font-weight: 800;
          font-size: 0.75rem;
          padding-left: 0
        }

        option {
           font-size: 0.75rem;
        }

      </style>
      <div class='visualization' data-name='DDHI Entity Browser'>
        <div class='controls'>
          <div id='filter-entities'>
            <select>
              <option value='all'>All entity types</option>
              <option value='event'>Event</option>
              <option value='person'>Persons</option>
              <option value='place'>Places</option>
              <option value='organization'>Organizations</option>
              <option value='date'>Dates</option>
            </select>
            <div class='formlabel'>Display type of entity</div>
          </div>
          <div id='sort-entities'>
            <select>
              <option value='data-appearance'>Appearance</option>
              <option value='data-mention'>Frequency</option>
              <option value='data-title'>Alphabetically</option>
            </select>
            <div class='formlabel'>Sort entities</div>
          </div>
        </div>
        <!--<div class='labels'><span class='devnote'>Entity descriptions to come.</span></div>-->
        <div class='entity-grid'></div>
      </div>
    `;
  }

  // @method connectedCallback()
  // @description Initializer method for this component.

  connectedCallback() {
    super.connectedCallback();
    this.initFilters();
    this.initSort();
  }


  // @method observedAttributes()
  // @description Lists the attributes to monitor. Listed attributes will
  //   trigger the attributeChangedCallback when their values change.
  // @return An array of monitored attributes.

  static get observedAttributes() {
    return ['ddhi-active-id','selected-entity','entity-sort','entity-filter'];
  }

  // @method attributeChangedCallback()
  // @description HTMLElement listener that detects changes to attributes. If the active
  //   ids are changed it triggers a transcript load process.

  /*
   *  A NOTE ON BUILD PROCESS
   *  - Entities are retrieved from the repo when the active id changes.
   *  - The indexEntities() method creates entity-card objects for each entity and adds them to a general index.
   *  - IndexEntities() also adds entity ids to sorted indices for retrieval during rendering
   *  - The render() process checks the value of the sort and filter controls, retrieves the values from the selected sort index, and renders.
   */

  async attributeChangedCallback(attrName, oldVal, newVal) {
    if(attrName == 'ddhi-active-id') {
      await this.getItemDataById();
      this.getMentionedEntities();
      await this.getEventData();
      this.indexEntities();
      this.render();
    }

    if (attrName == 'entity-filter') {
      this.filterEntities();
    }

    if (attrName == 'entity-sort') {
      this.render();
    }
  }


  initFilters() {
    const filterElement = this.shadowRoot.querySelector('#filter-entities select');
    var _this = this;

    _this.setAttribute('entity-filter','all');

    filterElement.addEventListener('change', event => {
      var element = event.currentTarget;
      _this.setAttribute('entity-filter',event.target.value);
    });

  }

  initSort() {
    const sortElement = this.shadowRoot.querySelector('#sort-entities select');
    var _this = this;

    _this.setAttribute('entity-sort','appearance');

    sortElement.addEventListener('change', event => {
      var element = event.currentTarget;
      _this.setAttribute('entity-sort',event.target.value);
    });

  }


  filterEntities() {
    const grid = this.shadowRoot.querySelector('.entity-grid');
    const entities = this.shadowRoot.querySelectorAll('entity-card');

    const filterValue = this.getAttribute('entity-filter');

    grid.style.opacity = 0;

    window.setTimeout(function() { grid.style.display = 'none' }, this.heartbeat);


    entities.forEach(function(entity,i) {

      if (filterValue == 'all') {
        entity.style.display = 'block';
      } else {

        if (entity.getAttribute('data-entity-type') == filterValue) {
          entity.style.display = 'block';
        } else {
          entity.style.display = 'none';
        }
      }
    });

    window.setTimeout(function() { grid.style.display = 'flex'; grid.style.opacity = 1 }, this.heartbeat * 2)
  }

  render() {

    const grid = this.shadowRoot.querySelector('.entity-grid');
    const entities = this.shadowRoot.querySelectorAll('entity-card');
    const sortValue = this.getAttribute('entity-sort');

    if (typeof this.sortIndex[sortValue] == 'undefined') {
      return;
    }

    grid.style.opacity = 0;

    window.setTimeout(function() { grid.style.display = 'none' }, this.heartbeat);

    // Empty grid
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }

    for (var i=0;i < this.sortIndex[sortValue].length;i++) {
      var id = this.sortIndex[sortValue][i].id;
      grid.appendChild(this.entityCardIndex[id]);
    }

    this.filterEntities();

    grid.style.opacity = 1;

    window.setTimeout(function() { grid.style.display = 'flex'; grid.style.opacity = 1 }, this.heartbeat * 2)
  }

  indexEntities() {
    this.resetIndices();
    var _this = this;
    var item = this.getItemData();
    var entityGrid = this.shadowRoot.querySelector('.entity-grid');

    entityGrid.textContent = '';

    // count appearances of a specific entity
    var entityMention = {};
    const monthLengths = {
      '01': {name: 'January', start: '1', end: '31'},
      '02': {name: 'February', start: '1', end: '28'},
      '03': {name: 'March', start: '1', end: '31'},
      '04': {name: 'April', start: '1', end: '30'},
      '05': {name: 'May', start: '1', end: '31'},
      '06': {name: 'June', start: '1', end: '30'},
      '07': {name: 'July', start: '1', end: '31'},
      '08': {name: 'August', start: '1', end: '31'},
      '09': {name: 'September', start: '1', end: '30'},
      '10': {name: 'October', start: '1', end: '31'},
      '11': {name: 'November', start: '1', end: '30'},
      '12': {name: 'December', start: '1', end: '31'}
    }

    // count order of appearance

    var i = 1;

    // Iterate over appearances by order of mention

    this.getEntitiesByOrderOfMention().forEach(function(id,i) {
      if (typeof _this.mentionedEntities[id] == 'undefined') {
        return;
      }

      var entity = _this.mentionedEntities[id];
      //  console.log("Entity in get mentioned: ", entity);

      if (entityMention.hasOwnProperty(entity.id)) {
        entityMention[entity.id] ++;
      } 
      else if (entity.resource_type ==='date' && entityMention.hasOwnProperty(entity.when)) {
        entityMention[entity.when] ++;
      }
      else if(entity.resource_type === 'date'){
        entityMention[entity.when] = 1
      }
      else {
        entityMention[entity.id] = 1; // first appearance
      }



      // Create a new entity card, set attributes, and attach the entity data

      var entity = _this.mentionedEntities[id];
      var entityCard = document.createElement('entity-card');
      entityCard.setAttribute('data-title',entity.title);
      entityCard.setAttribute('data-entity-id',entity.id);
      entityCard.setAttribute('data-entity-type',entity.resource_type);
      if(entity.resource_type !== 'date') {
        entityCard.setAttribute('data-mention',entityMention[entity.id]);
      }
      else {
        entityCard.setAttribute('data-mention', entityMention[entity.when]);
      }
      entityCard.setAttribute('data-appearance',i);
      entityCard.setData('entity',entity);
      entityCard.injectViewerObject(_this.viewer);

      // Add date information as attributes


      if (entity.resource_type === 'event' && _this.eventDateIndex.hasOwnProperty(entity.id)) {
        entityCard.setAttribute('data-start-date',_this.eventDateIndex[entity.id].startDate);
        entityCard.setAttribute('data-end-date',_this.eventDateIndex[entity.id].endDate);
        entityCard.setAttribute('data-point-in-time',_this.eventDateIndex[entity.id].pointInTime);
        entityCard.setAttribute('data-end-date',_this.eventDateIndex[entity.id].endDate);
        entityCard.setAttribute('data-sort-date-start',_this.eventDateIndex[entity.id].sortDateStart);
        entityCard.setAttribute('data-sort-date-end',_this.eventDateIndex[entity.id].sortDateEnd);
      }

      i++;

      var label = document.createElement('div');
      label.setAttribute('slot','label');
      if(entity.resource_type !== 'date') {
        var labelstr = entity.title;
        labelstr = labelstr.length > 35 ? labelstr.substring(0,30) + '...' : labelstr;
        label.appendChild(document.createTextNode(labelstr));
      }
      else {
        if(entity.when.length === 4) {
          label.appendChild(document.createTextNode(entity.when));
        }
        else if(entity.when.length === 7) {
          var month = entity.when.substring(5,7)
          
          label.appendChild(document.createTextNode(monthLengths[month].name + ' ' + entity.when.substring(0,4)));
        }
        else if(entity.when.length === 10) {
          var month = entity.when.substring(5,7)
          
          label.appendChild(document.createTextNode(monthLengths[month].name + ' ' + entity.when.substring(8,10) + ', ' + entity.when.substring(0,4)));
        }
      }

      var iconlabel = document.createElement('div');
      iconlabel.setAttribute('slot','iconlabel');
      if(entity.resource_type !== 'date') {
      iconlabel.appendChild(document.createTextNode(entityMention[entity.id]));
      }
      else { 
        iconlabel.appendChild(document.createTextNode(entityMention[entity.when]));
      }
      var heading = document.createElement('h3');
      heading.appendChild(document.createTextNode(entity.title));

      var description = document.createElement('description');


      var contents = document.createElement('div');
      contents.setAttribute('slot','contents');
      contents.appendChild(heading);
      contents.appendChild(description);

      entityCard.appendChild(iconlabel);
      entityCard.appendChild(label);
      entityCard.appendChild(contents);

      _this.indexEntityByAttribute('data-title',entityCard); // Index cards based on attributes
      _this.indexEntityByAttribute('data-appearance',entityCard,false,4);
      _this.indexEntityByFrequency(entityCard);

      _this.entityCardIndex[entity.id] = entityCard;  // Add card to general index for lookup
      if(entity.title) {
        entityGrid.appendChild(entityCard);  // Add card to grid
      }
    });

    this.sortIndices();

  }

  resetIndices() {
    this.sortIndex = {};
    this.entityCardIndex = {};
  }

  /**
   *  Generates sorted indices from entity-card DOM elements.
   *  Elements are added individually.
   *
   *  @param attr   The attribute
   */

  indexEntityByAttribute(attr,entity,reduce=true,padNumeric=0) {

    if (typeof this.sortIndex[attr] === "undefined") {
      this.sortIndex[attr] = [];
    }

    // Padding can help sort numbers properly.

    var key = padNumeric == 0 ? entity.getAttribute(attr) : String(entity.getAttribute(attr)).padStart(padNumeric,'0');

    var prop = {
      key: key,
      id: entity.getAttribute('data-entity-id')
    };

    function uniqueKey(a) {
      var seen = {};
      var out = [];
      var len = a.length;
      var j = 0;
      for(var i = 0; i < len; i++) {
        var key = a[i].key;
        if(seen[key] !== 1) {
          seen[key] = 1;
          out[j++] = a[i];
        }
      }
      return out;
    }

    this.sortIndex[attr].push(prop);

    if (reduce === true) {
      this.sortIndex[attr] = uniqueKey(this.sortIndex[attr]);
    }
  }

  indexEntityByFrequency(entity) {

    if (typeof this.sortIndex['data-mention'] == 'undefined') {
      this.sortIndex['data-mention'] = [];
    }

    var prop = {
      key: parseInt(entity.getAttribute('data-mention')), // key is the frequency of mentions
      id: entity.getAttribute('data-entity-id') // id is the id of the entity
    };

    // find the highest number of mentions

    function mostFrequentIndex(a) {
      var seen = {};
      var out = [];
      var len = a.length;
      for(var i = 0; i < len; i++) {
        var mcount = a[i].key; // mention count
        var id = a[i].id;
        if(typeof seen[id] === 'undefined' || mcount > seen[id]) {
          seen[id] = mcount; // capture the most frequent mention
        }
      }

      var j=0;
      for(var k = 0; k < len; k++) {
        var id = a[k].id;
        var key = a[k].key;
        if(seen[id] === key) { // if the highest number of mentions (seen) is the current entity mention count, output
          out[j++] = a[k];
        }
      }

      return out;
    }

    this.sortIndex['data-mention'].push(prop);

    this.sortIndex['data-mention'] = mostFrequentIndex(this.sortIndex['data-mention']);

  }

  sortIndices() {

    function compare( a, b ) {
      if ( a.key < b.key ){
        return -1;
      }
      if ( a.key > b.key ){
        return 1;
      }
      return 0;
    }

    function reverseCompare( a, b ) {
      if ( a.key < b.key ){
        return 1;
      }
      if ( a.key > b.key ){
        return -1;
      }
      return 0;
    }

    for(const key in this.sortIndex) {
      this.sortIndex[key].sort(key=='data-mention' ? reverseCompare : compare);
    }

  }

});
/**
 *  transcript-html element.
 *  Presents an interview transcript with named entity anchors.
 */

customElements.define('wikidata-viewer', class extends DDHIInfoPanel {
  constructor() {
    super();
    this.selectedEntity;
    this.selectedEntityElements = [];
    this.previousSelectedEntity = null; // Used to detect a change in selected entities.
    this.wikipediaAPIUrl = 'https://en.wikipedia.org/w/api.php?action=parse&prop=text&formatversion=2&format=json';
    this.wikiData = {};
    this.wikipediaData = {};
    // Attach a shadow root to <transcript-html>.
    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = `
      <style>

        :root {
          --black: #232526
        }

        * {
          color: var(--black);
          font-size: 0.8rem;
        }

        :host {
          display: block;
          height: 100%;
          width: 100%;
        }


        #info {
          width: 100%;
          height: 100%;
          overflow-y: scroll;
          padding-top: var(--ddhi-viewer-padding,1rem);
        }

        h2 {
          font-size: 1.2rem;
        }

        a {
          color: var(--black);
        }

        a:hover {
          color: #9D162E;
        }


      </style>
      <div id='info'>
        <h2>Wikipedia Viewer</h2>
        <p class='message'>Select an entity for viewing.</p>
      </div>
    `;
  }

  // @method connectedCallback()
  // @description Initializer method for this component.

  connectedCallback() {
    var _this = this;
    super.connectedCallback();
  }

  // @method observedAttributes()
  // @description Lists the attributes to monitor. Listed attributes will
  //   trigger the attributeChangedCallback when their values change.
  // @return An array of monitored attributes.

  static get observedAttributes() {
    return ['ddhi-active-id','selected-entity'];
  }

  async attributeChangedCallback(attrName, oldVal, newVal) {
    if(attrName == 'ddhi-active-id') {
      await this.getItemDataById();
    }

    if(attrName == 'selected-entity') {
      if(newVal.indexOf('Q') === 0) {
        await this.getWikipediaData();
        this.render();
      } else {
        this.renderMessage("No Wikidata information is provided for this item");
      }
    }
  }

  async getWikipediaData() {

    //var requestHeaders = new Headers();
    // requestHeaders.append('Origin', window.location.hostname);

    const qid = this.getAttribute('selected-entity');

    this.wikiData = await this.getWikiData([qid]);

    const wpUrl = this.wikiData.entities[qid].sitelinks.enwiki.url;
    const wpTitle = wpUrl.split('/').pop();

    // Note &origin=* parameter required for MediaWiki/Wikidata requests

    const wpResponse = await fetch(this.wikipediaAPIUrl + '&origin=*&page=' + wpTitle);
    const wpResult = await wpResponse.json();

    if (!wpResponse.ok) {
      const message = `An error has occured: ${wpResponse.status}`;
      throw new Error(message);
    }

    this.wikipediaData = wpResult.parse;

    return wpResponse;
  }

  render() {
    if(this.wikipediaData.length ==0) {
      this.renderMessage();
      return;
    }

    var infoContainer = this.shadowRoot.querySelector('#info');
    while (infoContainer.firstChild) {
      infoContainer.removeChild(infoContainer.firstChild);
    }

    var titleElement = document.createElement('h2');
    titleElement.appendChild(document.createTextNode(this.wikipediaData.title));

    var text = document.createElement('div');
    text.classList.add('description');

    // Replace internal links with external ones.

    var wptext = String(this.wikipediaData.text).replace(/href=\"\/wiki/g,'href="https://en.wikipedia.org/wiki').replace(/\<a /g,'<a target="_blank" ');
    text.innerHTML = wptext;

    infoContainer.appendChild(titleElement);
    infoContainer.appendChild(text);


  }

  renderMessage(msgTxt) {
    var message = document.createElement('p');
    message.classList.add('message');
    var textElement = document.createTextNode(msgTxt);
    var infoContainer = this.shadowRoot.querySelector('#info');
    // Empty info container
    while (infoContainer.firstChild) {
      infoContainer.removeChild(infoContainer.firstChild);
    }
    infoContainer.appendChild(textElement);
  }

});


/**
 *  transcript-html element.
 *  Presents an interview transcript with named entity anchors.
 */

customElements.define('transcript-html', class extends DDHIInfoPanel {
  constructor() {
    super();
    this.selectedEntity;
    this.selectedEntityElements = [];
    this.previousSelectedEntity = null; // Used to detect a change in selected entities.
    this.multiInterview;
    this.ids;
    // Attach a shadow root to <transcript-html>.
    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = `
      <style>

        :host {
          display: grid;
          grid-template-columns: 1fr;
          grid-template-rows: 3rem 1fr;
          height: 100%;
        }

        * {
         font-size: 0.8rem;
        }

        .controls {
          padding: var(--ddhi-viewer-padding, 1rem) 0;
          display: flex;
          flex-direction: row;
        }

        .controls a {
          display: flex;
          flex-direction: row;
          position: relative;
          margin-right: var(--ddhi-viewer-padding,1rem);
        }

        .previous, .next {
          font-size: 0.7rem;
          cursor: pointer;
          opacity: 0.7;
        }

        .previous:hover, .next:hover {
          opacity: 1;
        }

        .previous.disabled, .next.disabled {
          opacity: 0.3;
          pointer-events: none;
        }

        a.next:after {
          position: relative;
          content: '';
          height: 0.3rem;
          width: 0.3rem;
          top: 0.3rem;
          margin-left: 0.25rem;
          background: no-repeat url("data:image/svg+xml;base64,PHN2ZyBpZD0ibmV4dC1idG4iIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDE4LjQ1IDIwIj48ZGVmcz48c3R5bGU+LmNscy0xe2ZpbGw6IzAwMTcxYTt9PC9zdHlsZT48L2RlZnM+PHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMCwyMFYxNC45TDEzLjYzLDEwLDAsNS4xVjBMMTguNDUsNy4zNXY1LjNaIi8+PC9zdmc+");
        }

        a.previous:before {
          position: relative;
          content: '';
          height: 0.3rem;
          width: 0.3rem;
          top: 0.3rem;
          margin-right: 0.25rem;
          background: no-repeat url("data:image/svg+xml;base64,PHN2ZyBpZD0iY2hhcmFjdGVyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxOC40NSAyMCI+PGRlZnM+PHN0eWxlPi5jbHMtMXtmaWxsOiMwMDE3MWE7fTwvc3R5bGU+PC9kZWZzPjxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTE4LjQ1LDBWNS4xTDQuODIsMTAsMTguNDUsMTQuOVYyMEwwLDEyLjY1VjcuMzVaIi8+PC9zdmc+");
        }

        .info {
          overflow: auto;
        }

        interview_body {
          display: block;
          overflow-y: scroll;
          scroll-behavior: smooth;
          height: 100%;
        }

        dt, dd {
          line-height: 1.9;
        }

        dt {
          margin-bottom: 0;
          font-weight: 800;
          }

        dd {
          margin-left: 1rem;
        }

        dd span, dd date {
          display: inline-block;
          }

        dd span[data-entity-type='event'] {
          background-color: #D7E9F7;
        }

        dd span[data-entity-type='event']:hover, dd span[data-entity-type='event'].active {
          background-color: #9BC8EB;
          }

        dd span[data-entity-type='place'] {
          background-color: rgba(255,160,15,0.30);
        }

        dd span[data-entity-type='place']:hover, dd span[data-entity-type='place'].active {
          background-color: rgba(255,160,15,0.60);
          }

        dd span[data-entity-type='person'] {
          background-color: rgba(157,22,46,0.30);
        }

        dd span[data-entity-type='person']:hover, dd span[data-entity-type='person'].active {
          background-color: rgba(157,22,46,0.60);
        }

        dd span[data-entity-type='organization'] {
          background-color: rgba(0,60,115,0.30);
        }

        dd span[data-entity-type='organization']:hover, dd span[data-entity-type='organization'].active {
          background-color: rgba(0,60,115,0.60);
        }

        dd date {
          background-color: rgba(24,98,24,0.3);
        }
        dd date:hover, dd date.active {
          background-color: rgba(24,98,24,0.6);
        }

        .transcript-menu {
          overflow: hidden;
          border: 1px solid #ccc;
          background-color: #f1f1f1;
          height: max-content;
        }

        .disabled { 
          display: none;
        }
        
        /* Style the buttons inside the tab */
        .transcript-menu button {
          background-color: inherit;
          float: left;
          border: none;
          outline: none;
          cursor: pointer;
          padding: 7px 8px;
          transition: 0.3s;
          font-size: 12px;
        }
        
        /* Change background color of buttons on hover */
        .transcript-menu button:hover {
          background-color: #ddd;
        }
        
        /* Create an active/current tablink class */
        .transcript-menu button.active {
          background-color: #ccc;
        }


      </style>
      <div class='transcript-menu disabled'></div>
      <div class='controls'>
        <a class='previous disabled'>Previous Reference</a> <a class='next disabled'>Next Reference</a>
      </div>
      <div class='info'></div>
    `;
  }

  // @method connectedCallback()
  // @description Initializer method for this component.

  connectedCallback() {
    var component = this;

    super.connectedCallback();
    this.shadowRoot.querySelector('.previous').addEventListener('click', event => {
      if (this.selectedEntity != null) {
        component.decrementSelectedEntityIndex();
        component.focusSelectedEntity();
      }
    });
    this.shadowRoot.querySelector('.next').addEventListener('click', event => {
      if (this.selectedEntity != null) {
        component.incrementSelectedEntityIndex();
        component.focusSelectedEntity();
      }
    });
  }

  // @method observedAttributes()
  // @description Lists the attributes to monitor. Listed attributes will
  //   trigger the attributeChangedCallback when their values change.
  // @return An array of monitored attributes.

  static get observedAttributes() {
    return ['ddhi-active-id','selected-entity','viz-type'];
  }

  // @method attributeChangedCallback()
  // @description HTMLElement listener that detects changes to attributes. If the active
  //   ids are changed it triggers a transcript load process.

  async attributeChangedCallback(attrName, oldVal, newVal) {
    if(attrName == 'ddhi-active-id') {
      await this.getItemDataById();
      this.multiInterview;
      await this.getAssociatedEntitiesByType(this,'multiInterview',this.getActiveIdFromAttribute());
      this.ids = this.getActiveIdFromAttribute().split(',')
      this.render();
      this.ids = this.getActiveIdFromAttribute().split(',')
      if(this.getAttribute('viz-type') == 'multi') {
        this.updateTabs()
      }
    }

    if(attrName == 'selected-entity') {
      this.selectedEntity = this.hasAttribute('selected-entity') ? this.getAttribute('selected-entity') : null;
      if (this.selectedEntity != null) {

        // Enable next and previous controls

        this.shadowRoot.querySelector('.previous').classList.remove('disabled');
        this.shadowRoot.querySelector('.next').classList.remove('disabled');

        this.getSelectedEntityElements();
        this.highlightSelectedEntity();
        //this.setSelectedEntityIndex();
        this.focusSelectedEntity();
      } else {

        // disable next and previous controls

        this.shadowRoot.querySelector('.previous').classList.remove('disabled');
        this.shadowRoot.querySelector('.next').classList.remove('disabled');
      }
    }

    if(attrName == 'viz-type') {
      console.log('Viz type changed in transcript')
    
      console.log(this.ids, this.getActiveIdFromAttribute())
      if(this.getAttribute('viz-type') == 'multi') {
        this.updateTabs()
        this.shadowRoot.querySelector('.transcript-menu').classList.remove('disabled');
      }
      if(this.getAttribute('viz-type') == 'single') {
        this.shadowRoot.querySelector('.transcript-menu').classList.add('disabled');
      }
    }

  }

  setSelectedEntityIndex() {
    if (this.previousSelectedEntity == this.selectedEntity) {
      this.incrementSelectedEntityIndex();
    } else {
      this.propagateAttributes('data-entity-index',0); // reset
    }


    this.previousSelectedEntity = this.selectedEntity;
  }

  getSelectedEntityIndex() {
    return this.hasAttribute('data-entity-index') ? parseInt(this.getAttribute('data-entity-index')) : 0;
  }

  incrementSelectedEntityIndex() {
    var index = this.getSelectedEntityIndex() + 1 // increment
    if (index == this.selectedEntityElements.length) {
      index = 0;
    }

    this.propagateAttributes('data-entity-index',index);
  }

  decrementSelectedEntityIndex() {
    var index = this.getSelectedEntityIndex() - 1; // decrement

    if (index < 0) {
      index = this.selectedEntityElements.length - 1;
    }

    this.propagateAttributes('data-entity-index',index);
  }

  getSelectedEntityElements() {
    this.selectedEntityElements = this.shadowRoot.querySelectorAll('[data-entity-id="' + this.selectedEntity + '"]');
  }

  highlightSelectedEntity() {
    this.shadowRoot.querySelectorAll('[data-entity-id]').forEach(function(e) {
      e.classList.remove('active');
    });


    this.selectedEntityElements.forEach(function(e) {
      e.classList.add('active');
    });
  }

  focusSelectedEntity() {

    if (this.selectedEntityElements.length == 0) {
      return;
    }

    var interviewElement = this.shadowRoot.querySelector('interview_body');
    var interviewTop = interviewElement.getBoundingClientRect().top;

    var topPos = this.selectedEntityElements[this.getSelectedEntityIndex()].offsetTop;

    interviewElement.scroll({
      top: topPos - interviewTop - 30,
      behavior: 'smooth'
    });


  }

  removeAllChildNodes(parent) {
    while (parent.firstChild) {
        parent.removeChild(parent.firstChild);
    }
}

  updateTabs() {
    var modal = this.shadowRoot.querySelector(".transcript-menu")
    
    modal.addEventListener('click', (event) => {
      const isButton = event.target.nodeName === 'BUTTON';
      if (!isButton) {
        return;
      }
      this.renderMulti(event.target.value)
    })
    
    this.removeAllChildNodes(modal);
    for(var i=0; i<this.ids.length; i++) {
      var button = document.createElement('button');
      var id = this.ids[i]
      button.value = id;
      var narrator = this.multiInterview[id].title.split(' ')
      narrator = narrator[narrator.length-1]
      var t = document.createTextNode(narrator);
      button.appendChild(t);
      modal.appendChild(button)
    }
  }

  // @method render()
  // @description View display method for this component..

  render() {
    var item = this.getItemData();

    if (item.hasOwnProperty('transcript')) {
      this.renderValue(this.shadowRoot.querySelector('.info'),item.transcript);
    }
  }

  renderMulti(id) {
      var item = this.multiInterview[id];
  
      if (item.hasOwnProperty('transcript')) {
        this.renderValue(this.shadowRoot.querySelector('.info'),item.transcript);
      }
    
  }
});


/**
 *  ddhi-entity element.
 *  The primary DDHI Viewer web application.
 */

customElements.define('entity-card', class extends DDHIDataComponent {
  constructor() {
    super();

    this.id;
    this.entityAnchor; // The wrapping anchor tag of the DOM element

    // Define the shadow root
    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = `
      <style>
        :host {
          position: relative;
          width: 3.5rem;
          height: 3.5rem;
          margin: 0 1rem 3.5rem 1rem;
        }

        a#entity-link {
          text-decoration: none;
          cursor: pointer;
        }

        .entity-icon {
          height: 2rem;
          width: 2rem;
          margin: 0 auto 0.5rem auto;
          border-radius: 0.25rem;
          display: flex;
          justify-content: center;
          align-items: center;
          color: var(--card-txt, #FFFFFF);
          font-weight: 800;
          font-size: 0.7rem;
        }

        :host([data-entity-type='event']) .entity-icon {
          background-color: #9BC8EB;
        }

        :host([data-entity-type='place']) .entity-icon {
          background-color: #FFA00F;
        }

        :host([data-entity-type='person']) .entity-icon {
          background-color: #9D162E;
        }

        :host([data-entity-type='organization']) .entity-icon {
          background-color: #003C73;
        }

        :host([data-entity-type='date']) .entity-icon {
          background-color: rgb(24,98,24);
        }

        .entity-label {
          font-size: 0.7rem;
          text-align: center;
        }

        .entity-contents {
          display: none;
        }

        .entity-dates {
          margin-top: 0.2rem;
          font-size: 0.6rem;
          text-align: center;
          overflow-x: visible;
        }

      </style>
      <a id='entity-link'>
        <div class='entity-icon'>
          <span><slot name='iconlabel'></slot></span>
        </div>
        <div class='entity-label'>
          <slot name='label'></slot>
        </div>
        <div class='entity-dates'>
        <slot name='date-range'></slot>
      </div>
      </a>
      <div class='entity-contents'>
        <slot name='contents'></slot>
      </div>
    `;
  }

  async connectedCallback() {
    super.connectedCallback();

    this.id = this.getAttribute('data-entity-id');
    this.entityAnchor = this.shadowRoot.querySelector('a#entity-link');

    var entitycard = this;

    this.entityAnchor
      .addEventListener('click', event => {
        if (entitycard.hasAttribute('data-mention')) {
          entitycard.propagateAttributes('data-entity-index',entitycard.getAttribute('data-mention') - 1);
        }
        entitycard.propagateSelectedEntity(entitycard.id);
      });
    this.entityAnchor
      .addEventListener('touch', event => {
        entitycard.propagateSelectedEntity(entitycard.id);
        if (entitycard.hasAttribute('data-mention')) {
          entitycard.propagateAttributes('data-entity-index',entitycard.getAttribute('data-mention') - 1);
        }
        entitycard.propagateSelectedEntity(entitycard.id);
      });
  }

});


/**
 *  ddhi-viewer element.
 *  The primary DDHI Viewer web application.
 */

customElements.define('ddhi-viewer', class extends DDHIDataComponent {
  constructor() {
    super();

    this.visContainer;
    this.infoContainer;
    this.visualizations = [];
    this.infoPanels = [];
    this.titleContainer;
    this.vizcontrols; // Selection mechanism for visualizations
    this.ivcontrols; // Selection mechanism for information view
    this.vizMode = 'single';

    // Define the shadow root
    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          color: #232526;
        }

        :host {
          display: block;
          width: 100%;
          height: 100%;
          font-family: var(--body-font);
          --ddhi-viewer-padding: 0.8rem;
          --heading-font: "Aleo-Regular", Georgia, serif;
          --body-font: "Roboto-Regular", Tahoma, sans-serif;
        }

        #viewer {
          display: grid;
          width: 100%;
          height: 100%;
          grid-template-rows: 100%;
          grid-template-columns: 10% 55.5% 34.5%
        }

        @media screen and (min-width: 62.5em) {
          #viewer {
            min-height: 500px;
          }
        }

        @media screen and (min-width: 62.5em) and (max-height: 500px) {
          #viewer {
            height: calc(500px - var(--ddhi-viewer-padding));
          }
        }

        @media screen and (min-width: 62.5em) and (min-height: 500px) {
          #viewer {
            max-height: calc(100vh - var(--ddhi-viewer-padding));
          }
        }

        section {
          display: flex;
          flex-direction: column;
          height: 100%;
          justify-content: flex-start;
          overflow: hidden;;
          padding: var(--ddhi-viewer-padding)

        }

        section#menu > ul {
          overflow-y: scroll;
        }

        #stage > * {
          width: 100%;
        }

        #visualizations {
          height: 100%;
          overflow: hidden;
          flex-shrink: 1;
          flex-grow: 1;
          padding: var(--ddhi-viewer-padding)
        }

        ::slotted(div[slot='visualizations']) {
          display: block;
          height: 100%;
          width: 100%;
        }

        section#menu {
          border-right: 1px solid var(--ddhi-viewer-border-color,#E9E9E9);
          padding-left: 0 !important;
        }


        section#information-viewer {
          border-left: 1px solid var(--ddhi-viewer-border-color,#E9E9E9);
        }

        ::slotted(div[slot='infopanels']) {
          height: 100%;
          overflow-y: hidden;
        }

        #stage > header, section#information-viewer header {
          width: 100%;
          height: var(--view-header-height,6rem);
          flex-shrink: 0;
          flex-grow: 0;
          padding-bottom: var(--ddhi-viewer-padding, 1rem);
          border-bottom: 1px solid var(--ddhi-viewer-border-color,#E9E9E9);
        }

        #stage > header {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          justify-content: space-between;
          overflow-y: hidden;
        }

        #information-viewer header {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
        }

        #title h2 {
          display: block;
          display: -webkit-box;
          text-overflow: ellipsis;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
          font-family: var(--heading-font);
        }

        #vizcontrols, #ivcontrols {
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          height: 100%;
        }

        #stage > footer {
          width: 100%;
          height: var(--view-header-height,6rem);
          flex-shrink: 0;
          flex-grow: 1;
          background-repeat: no-repeat;
          background-position: bottom right;
          background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NjQuNDggMTAwIj48cGF0aCBkPSJNMCA5OS4zNlY4Mi45NGgxNi40MnYxNi40em00MSAwVjgyLjkxSDI0LjU1djE2LjQzem0yNC41NSAwVjgyLjk0SDQ5LjA5djE2LjQyem0yNC41NCAwVjgyLjg3SDczLjY0Vjk5LjN6bTI0LjU1IDBWODIuODVIOTguMTl2MTYuNDN6bTI0LjU1IDBWODIuOTRoLTE2LjQ2djE2LjQyem0yNC41NCAwVjgyLjgxaC0xNi40NXYxNi40M3ptMjQuNTUgMFY4Mi43OWgtMTYuNDV2MTYuNDN6bTI0LjU0IDBWODIuNzdIMTk2LjR2MTYuNDF6bTI0LjU1IDBWODIuNzVoLTE2LjQydjE2LjQ0ek00MSA3NVY1OC41NEgyNC41OFY3NXptMjQuNTUgMFY1OC41OEg0OS4xM1Y3NXptNDkuMDkgMFY1OC40OUg5OC4xN3YxNi40M3ptMjQuNTUgMFY1OC41OGgtMTYuNDhWNzV6bTI0LjU0IDBWNTguNDVoLTE2LjQ3djE2LjQzem0yNC41NSAwVjU4LjQzaC0xNi40N3YxNi40M3ptNDkuMDkgMFY1OC4zOUgyMjAuOXYxNi40M3pNNjUuNDkgNTEuMzlWMzVINDkuMDZ2MTYuNDF6bTczLjY0IDBWMzQuOTJIMTIyLjd2MTYuNDN6bTI0LjU0IDBWMzQuOWgtMTYuNDN2MTYuNDJ6bS05OC4yLTIzLjU1VjExLjQyTDQ5IDExLjQ0djE2LjQyem03My42NC0uMDVWMTEuMzdoLTE2LjQzVjI3Ljh6bTI0LjU1IDBWMTEuMzdoLTE2LjQ0djE2LjQyem03My42NSAyMy40OVYzNC44NGgtMTYuNDN2MTYuNDN6bTExNy40NiA0MS40MXY2LjUxaC0xNy4xMmEzLjkzIDMuOTMgMCAwMS0zLjgzLTNsLS44OC02LjdjLTYuMjcgNy0xMy41IDEwLjQ4LTIyLjA3IDEwLjQ4LTguMTYgMC0xNC40MS0zLTE5LjEtOXMtNy0xNC44OS03LTI1Ljg4YzAtMTAuMzEgMi42OC0xOC44NCA4LTI1LjM1IDUuNDgtNi44NSAxMi44NC0xMC4zMyAyMS44Ny0xMC4zM2EyNC4zMiAyNC4zMiAwIDAxMTcuNjIgNi45NHYtMjUuM2wtOC4zMi0xLjQ5YTIuOSAyLjkgMCAwMS0yLjU1LTMuMDZWMGgyMy45djg4LjE1YzQuMzguODIgNi40OSAxLjI2IDcuMjIgMS41MWEyLjc0IDIuNzQgMCAwMTIuMjYgMy4wM3pNMzMyLjIgNzkuNDdWNDcuNThhMTcuOTIgMTcuOTIgMCAwMC0xNC44My03LjVjLTYuMjcgMC0xMC45IDIuMDgtMTQuMTggNi4zNnMtNC44OSAxMC40Mi00Ljg5IDE4LjY3YzAgMTIuNSAzLjA3IDE5LjkzIDkuNCAyMi43MWExNy41NCAxNy41NCAwIDAwNyAxLjI3aC4zbC4xMy4xM2M2LjUxLS4wOSAxMi4yNS0zLjM3IDE3LjA3LTkuNzV6bTEwMiAxMy4yMnY2LjUxaC0xNy4xNGEzLjkxIDMuOTEgMCAwMS0zLjgzLTNsLS44OS02LjdjLTYuMjYgNy0xMy40OSAxMC40OC0yMi4wNiAxMC40OC04LjE3IDAtMTQuNDItMy0xOS4xLTlzLTctMTQuODktNy0yNS44OGMwLTEwLjMxIDIuNjgtMTguODQgOC0yNS4zNUMzNzcuNiAzMi45MSAzODUgMjkuNDMgMzk0IDI5LjQzYTI0LjI4IDI0LjI4IDAgMDExNy42MSA2Ljk0VjExLjA2bC04LjMyLTEuNDlhMi45IDIuOSAwIDAxLTIuNTUtMy4wNlYwaDIzLjl2ODguMTVjNC40NC44MyA2LjQ5IDEuMjYgNy4yMyAxLjUxYTIuNzQgMi43NCAwIDAxMi4zMSAzLjAzem0tMjIuNi0xMy4yMlY0Ny41OGExNy45IDE3LjkgMCAwMC0xNC44My03LjVjLTYuMjYgMC0xMC45IDIuMDgtMTQuMTcgNi4zNnMtNC45IDEwLjQyLTQuOSAxOC42N2MwIDEyLjUgMy4wOCAxOS45MyA5LjQgMjIuNzFhMTcuNjEgMTcuNjEgMCAwMDcgMS4yN2guMjlsLjEyLjEzYzYuNTQtLjA5IDEyLjI4LTMuMzcgMTcuMDktOS43NXptMTA3LjQ4IDEwLjMyYy0uNzktLjI2LTMuMTEtLjc2LTcuMDktMS41MVY1NS44M2MwLTcuODMtMi4wNy0xNC40LTYtMTlzLTkuODUtNy4xMy0xNy4yMi03LjEzYy03LjY2IDAtMTQuNDggMy0yMC43OSA5LjFWLjI3aC0yNC4xN3Y2LjI0YTMuMSAzLjEgMCAwMDIuNTkgMy4xN2MuOC4yNyAzLjUxLjc3IDguMjggMS41M3Y3Ny4yMWwtNi44NyAxLjM1YTMuMTMgMy4xMyAwIDAwLTIuNjcgMy4yM3Y2LjJoMzIuMzhWOTNhMy4xMyAzLjEzIDAgMDAtMi42NC0zLjE5Yy0uNjItLjE1LTIuNjgtLjU4LTUuODgtMS4ybC0xLS4xN1Y0OS40N2M1LjQ3LTYuMDYgMTEuMTQtOSAxNy4zNS05IDkgMCAxMy41IDUuMTcgMTMuNSAxNS4zNlY5OS4yaDIyLjcxVjkzYTMgMyAwIDAwLTIuNDgtMy4yMXptMjMtNzMuMTFhMTAuMTEgMTAuMTEgMCAwMDIuODMgMiA4LjY4IDguNjggMCAwMDcgMCAxMC4zMiAxMC4zMiAwIDAwMi44My0yIDEwLjExIDEwLjExIDAgMDAyLTIuODMgNy43MyA3LjczIDAgMDAuODctMy40OSA4LjI0IDguMjQgMCAwMC0uODctMy42MiAxMC42NSAxMC42NSAwIDAwLTItMyAxMC4xMSAxMC4xMSAwIDAwLTIuODMtMiA4LjU4IDguNTggMCAwMC03IDAgMTAuMTEgMTAuMTEgMCAwMC0yLjgzIDIgMTAuODkgMTAuODkgMCAwMC0yIDMgOCA4IDAgMDAtLjczIDMuNjIgNy41OCA3LjU4IDAgMDAuNzMgMy40OSAxMC4xMyAxMC4xMyAwIDAwMi4wMyAyLjgzem0xOS44MyA3Mi45NWwtNy0xLjM1VjMwLjc2aC0yMi42OFYzN2EzLjI1IDMuMjUgMCAwMDIuNTQgMy4xOWw3LjE0IDEuMzV2NDYuNzRsLTcuMTYgMS4zNmEzLjIzIDMuMjMgMCAwMC0yLjUyIDMuMTh2Ni4zOGgzMi4yNXYtNi4zOGEzLjI0IDMuMjQgMCAwMC0yLjU0LTMuMTl6IiBmaWxsPSIjYmRiZWJlIi8+PC9zdmc+");
          background-size: 8rem;
          padding-top: var(--ddhi-viewer-padding, 1rem);
          border-top: 1px solid var(--ddhi-viewer-border-color,#E9E9E9);
          display: flex;
          flex-direction: row;
          justify-content: flex-start;
          align-items: flex-start;
        }

        #stage > footer > * {
          width: 50%;
        }


        #media-player {
          width: 50%;
        }

        #legend {
          padding-left: var(--ddhi-viewer-padding, 1rem);
        }

        #legend-items {
          display: flex;
          flex-direction: row;
          justify-content: flex-end;
          align-items: center;
          font-size: 0.75rem;
        }

        #legend-items > * {
          position: relative;
          display: flex;
          flex-direction: row;
          justify-content: flex-start;
          align-items: center;
          margin-right: var(--ddhi-viewer-padding, 1rem);
        }

        #legend-items > *:last-child {
          margin-right: 0
        }

        #legend-items > *:before {
          content: '';
          height: 1rem;
          width: 1rem;
          background-color: var(--ddhi-viewer-border-color,#E9E9E9);
          margin-right: 0.5rem;
          border-radius: 2px;
        }

        #legend-items > .events:before {
          background-color: #9BC8EB;
        }

        #legend-items > .places:before {
          background-color: #FFA00F;
        }

        #legend-items > .persons:before {
          background-color: #9D162E;
        }

        #legend-items > .organizations:before {
          background-color: #003C73;
        }

        #legend-items > .dates:before {
          background-color: rgb(24,98,24);
        }

        h2 {
          margin: 0 0 0.5rem 0;
          font-family: "Aleo-Regular", Georgia, serif;
          font-size: 1.5rem;
          font-weight: 400;
        }

        h3 {
          font-size: 1rem;
          font-weight: 700;
          text-transform: uppercase;
          margin: 0 0 0.1rem 0;
        }


        #menu header {
          font-size: 0.7rem;
          color: #919293;
          font-weight: 800;
          text-transform: uppercase;
          padding-bottom: var(--ddhi-viewer-padding);
        }

        ul#interview-menu {
          padding: 0;
          margin: 0;
          font-size: 0.95rem;
        }

        #interview-menu li {
          list-style-type: none;
          font-size: 0.75rem;
          font-weight: 400;
          margin-left: 0;
          padding-left: 0;
          margin-bottom: 0.75rem;
        }

        #interview-menu li a.active {
          font-weight: 800;
        }

        #interview-menu li:hover {
          text-decoration: underline;
        }

        #interview-menu a {
          cursor: pointer;
        }

        metadata-field {
          display: inline-block;
          margin-right: 1rem;
        }

        .metadata-field .label {
          text-transform: uppercase;
          font-size: 0.75rem;
          color: #919293;
          font-weight: 800;
          display: inline-block;
          margin-right: 0.25rem;
        }

        .metadata-field .value {
          font-size: 0.75rem;
          color: #4F5152;
        }

        .formlabel {
          color: #99A2A3;
          font-size: 0.75rem;
        }

        select {
          -webkit-appearance: none;
          -webkit-border-radius: 0;
          border-width: 0 0 2px 0;
          border-bottom-color: #9BC8EB;
          height: 2rem;
          width: 15rem;
          text-transform: uppercase;
          font-weight: 800;
          font-size: 0.85rem;
          padding-left: 0
        }

        #tei-link a {
          display: block;
          cursor: pointer;
          height: 30px;
          width: 43px;
          background: no-repeat url("data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI1LjMuMSwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAzMCA0Mi44IiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCAzMCA0Mi44OyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+CjxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+Cgkuc3Qwe2ZpbGw6IzIzMjUyNjt9Cgkuc3Qxe2ZvbnQtZmFtaWx5OidSb2JvdG8tUmVndWxhcic7fQoJLnN0Mntmb250LXNpemU6Ni4zOTQzcHg7fQo8L3N0eWxlPgo8Zz4KCTxnPgoJCTx0ZXh0IHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIDEgMi40NDE0MDZlLTA0IDMzLjg1OTkpIj48dHNwYW4geD0iMCIgeT0iMCIgY2xhc3M9InN0MCBzdDEgc3QyIj5Eb3dubG9hZDwvdHNwYW4+PHRzcGFuIHg9IjEwLjEiIHk9IjcuMiIgY2xhc3M9InN0MCBzdDEgc3QyIj5URUk8L3RzcGFuPjwvdGV4dD4KCTwvZz4KCTxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik0yNy40LDE1LjlIMi43Yy0xLDAtMS45LDAuOS0xLjksMS45djMuOGMwLDEsMC45LDEuOSwxLjksMS45aDI0LjdjMSwwLDEuOS0wLjksMS45LTEuOXYtMy44CgkJQzI5LjMsMTYuNywyOC41LDE1LjksMjcuNCwxNS45eiBNMjMuOSwyMi4xYy0wLjUsMC0xLTAuNC0xLTAuOWMwLTAuNSwwLjQtMC45LDEtMC45YzAuNSwwLDEsMC40LDEsMC45CgkJQzI0LjksMjEuNiwyNC40LDIyLjEsMjMuOSwyMi4xeiBNMjYuOCwyMi4xYy0wLjUsMC0xLTAuNC0xLTAuOWMwLTAuNSwwLjQtMC45LDEtMC45YzAuNSwwLDEsMC40LDEsMC45CgkJQzI3LjcsMjEuNiwyNy4zLDIyLjEsMjYuOCwyMi4xeiBNNi4zLDYuOGw2LjgsMy44djIuOUw0LjIsNy44VjUuN0wxMywwdjIuOUw2LjMsNi44eiBNMjMuOSw2LjdsLTcuMS0zLjlWMEwyNiw1LjZ2Mi4ybC05LjIsNS43CgkJdi0yLjlMMjMuOSw2Ljd6Ii8+CjwvZz4KPC9zdmc+Cg==");
          opacity: 0.7;
        }

        #tei-link a:hover {
          opacity: 1;
        }

        .switch-field {
          display: flex;
          margin-bottom: 12px;
        }
        
        .switch-field input {
          position: absolute !important;
          clip: rect(0, 0, 0, 0);
          height: 1px;
          width: 1px;
          border: 0;
          overflow: hidden;
        }
        
        .switch-field label {
          background-color: #e4e4e4;
          color: rgba(0, 0, 0, 0.6);
          font-size: 10px;
          line-height: 1;
          text-align: center;
          padding: 4px 8px;
          margin-right: -1px;
          border: 1px solid rgba(0, 0, 0, 0.2);
          box-shadow: inset 0 1px 3px rgb(0 0 0 / 30%), 0 1px rgb(255 255 255 / 10%);
          transition: all 0.1s ease-in-out;
      }
        
        .switch-field label:hover {
          cursor: pointer;
        }
        
        .switch-field input:checked + label {
          background-color: #f8f8f8;
          box-shadow: none;
        }
        
        .switch-field label:first-of-type {
          border-radius: 4px 0 0 4px;
        }
        
        .switch-field label:last-of-type {
          border-radius: 0 4px 4px 0;
        }
        



      </style>
      <div id='viewer'>
        <section id='menu' propagate>
        <div class='switch-field'>
        <input type="radio" id="single" name="viz_type" value="single" checked onclick="this.getRootNode().host.updateVizType('single')" >
        <label for="single">Single</label>
        <input type="radio" id="multi" name="viz_type" value="multi" onclick="this.getRootNode().host.updateVizType('multi')" >
        <label for="multi">Multi</label>
        </div>
          <header>Select an interview:</header>
          <ul id='interview-menu'></ul>
        </section>
        <section id='stage'>
          <header>
            <div id='title'></div>
            <div id='vizcontrols'><select></select><div class='formlabel'>Select a visualization.</div></div>
          </header>
          <div id='visualizations'>
            <slot name='visualizations'></slot>
          </div>
          <footer>
            <div id='media-player' propagate>
              <audio
                controls
                src="https://ddhi.agilehumanities.ca/sample-audio/alverson_hoyt.mp3">
                    Your browser does not support the
                    <code>audio</code> element.
              </audio>
            </div>
            <div id='legend'>
              <div id='legend-items'>
                <div class='events'>Events</div>
                <div class='organizations'>Organizations</div>
                <div class='persons'>Persons</div>
                <div class='places'>Places</div>
                <div class='dates'>Dates</div>
              </div>
            </div>
          </footer>
        </section>
        <section id='information-viewer'>
          <header>
            <div id='ivcontrols'><select></select><span class='formlabel'>Select an information display.</span></div>
            <div id='tei-link'><a title='Download TEI XML File' download></a></div>
          </header>
          <slot id='infopanels' name='infopanels'></slot>
        </section>
      </viewer>
    `;
  }

  // @method connectedCallback()
  // @description Initializer method for this component.

  async connectedCallback() {
    super.connectedCallback();

    // this.viewer is used in the parent Data componentÄ™s propagation system and
    // is derived from a selection query of an elementÄ™s parents. This will return
    // null for the viewer component itself, so it must be explicitly set.

    this.viewer = this;

    // localized version for subroutines.

    var viewer = this;


    // Assign viewer header

    this.titleContainer = this.shadowRoot.getElementById('title');

    // Set up panel selection mechanisms (options set in registerUserComponents)

    this.vizcontrols = this.shadowRoot.getElementById('vizcontrols').querySelector('select');

    this.ivcontrols = this.shadowRoot.getElementById('ivcontrols').querySelector('select');


    // Register User Visualizations and Info Panels

    await this.registerUserComponents();

    // Set up controls

    this.initializePanelSwitching();

    // Populate transcripts from REST api

    await this.getTranscripts();


    // Set Active Menu

    var menu = this.shadowRoot.getElementById('interview-menu');

    for(var i=0;i<this.availableIds.length;i++) {
      var listEl = document.createElement('li');
      var aEl = document.createElement('a');
      aEl.setAttribute('data-id',this.availableIds[i].id);
      aEl.appendChild(document.createTextNode(this.availableIds[i].title.replace('Transcript of an Interview with a', 'Narrator:').replace('Transcript of an Interview with', 'Narrator:')));
      aEl.addEventListener('click', event => {
        var element = event.currentTarget;
        var transcriptID = element.getAttribute('data-id');

        var radio = this.shadowRoot.querySelector('input[name="viz_type"]:checked')
        if(radio.value == 'single') {
          menu.querySelectorAll('.active').forEach(function(e){
            e.classList.remove('active');
          });

          element.classList.add('active');
          this.deactivateIds();
          this.activateId(transcriptID);
        }
        /*
         Logic for multiple active transcripts.
        */      
        else {
          if (element.classList.contains('active')) {
              
            this.deactivateIds(transcriptID);
            element.classList.remove('active');
          } else {
            this.activateId(transcriptID);
            element.classList.add('active');
          }
        }
      });

      listEl.appendChild(aEl);
      menu.appendChild(listEl);
    }

    // Fire click event on first menu item

    var evObj = document.createEvent('Events');
    evObj.initEvent('click', true, false);
    menu.querySelector('a').dispatchEvent(evObj);

  }

  // @method activateId()
  // @description Adds a transcript to the active list and triggers propagation.

  activateId(id) {
    const index = this.activeIds.indexOf(id);
    if (index == -1) {
      this.activeIds.push(id);
    }
    this.propagateActiveIds();
  }

  // @method deactivateIds()
  // @description Remove all active IDs. Will not trigger propagation unless an id is supplied.
  // @param id  Deactivates the supplied id and triggers propagation

  deactivateIds(id=null) {

    if (id==null) {
      this.activeIds = [];
    } else {
      const index = this.activeIds.indexOf(id);
      if (index > -1) {
        this.activeIds.splice(index, 1);
      }
      this.propagateActiveIds();
    }
  }

  updateVizType(type) {
    this.vizMode = type;
    if(this.vizMode == 'single') {
      var first = this.activeIds[0]
      var active = this.shadowRoot.querySelector('a[data-id=\"'+first+'"]')
      active.click();
      this.activateId(first);
    }
    this.propagateAttributes('viz-type', type);
  }

  // @method observedAttributes()
  // @description Lists the attributes to monitor. Listed attributes will
  //   trigger the attributeChangedCallback when their values change.
  // @return An array of monitored attributes.

  static get observedAttributes() {
    return ['ddhi-active-id','selected-entity'];
  }


  // @method observedAttributes()
  // @description Lists the attributes to monitor. Listed attributes will
  //   trigger the attributeChangedCallback when their values change.
  // @return An array of monitored attributes.

  async attributeChangedCallback(attrName, oldVal, newVal) {
    if(attrName == 'ddhi-active-id') {
      await this.getItemDataById();

      await this.getTEI(this.getAttribute('ddhi-active-id'));

      this.teiLink = this.teiResource.filepath;

      var teiLinkElement = this.shadowRoot.getElementById('tei-link').querySelector('a');
      teiLinkElement.setAttribute('href', this.teiLink);

      this.render();
    }
  }

// TODO: Add mult interview
  async getTEI(id,format='json') {
    var oneId = id.split(",")

    const response = await fetch(this.apiURI + '/items/' + oneId[0] + '/tei?_format=' + format, {mode: 'cors'});
    const result = await response.json();

    if (!response.ok) {
      const message = `An error has occured: ${response.status}`;
      throw new Error(message);
    }

    this.teiResource = result;

    return response;

  }


  // @method registerUserComponents()
  // @description  Registers user components like visualizations and infoPanels.
  //   setTimeout waits for the DOM to be rendered. A promise is
  //   then created to ensure that object properties were set.

  async registerUserComponents() {

    var viewer = this;

    var componentsReady = new Promise(function(resolve) {

      setTimeout(function() {
        [... viewer.children].forEach(function(e){
          if (e.getAttribute('slot')=='visualizations') {
            viewer.visContainer = e;
            viewer.visualizations = [... e.children];

            viewer.visualizations.forEach(function(e,i) {
              var option = document.createElement('option')
              option.setAttribute('value',i);
              option.appendChild(document.createTextNode(e.getAttribute('data-label')));
              viewer.vizcontrols.appendChild(option);
            });

          }

          if (e.getAttribute('slot')=='infopanels') {
            viewer.infoContainer = e;
            viewer.infoPanels = [... e.children];

            viewer.infoPanels.forEach(function(e,i) {
              var option = document.createElement('option')
              option.setAttribute('value',i);
              option.appendChild(document.createTextNode(e.getAttribute('data-label')));
              viewer.ivcontrols.appendChild(option);
            });
          }

          resolve();
        });
      }, 100);

    });

    await componentsReady;

    //await infoPanels;

  }

  initializePanelSwitching() {
    var viewer = this;


    viewer.visualizations.forEach(function(e,i) {
      // set panel height

      e.style.height = '100%';

      // hide panels;
      if (i > 0) {
        e.style.display = 'none';
      } else {
        e.style.display = 'block';
      }
    });


    // Add change listeners that trigger switching


    viewer.vizcontrols.addEventListener('change', event => {
      var element = event.currentTarget;
      viewer.visualizations.forEach(function(e,i) {
        e.style.display = 'none';
        e.removeAttribute('foreground')
      });

      viewer.visualizations[event.target.value].style.display = 'block';
      viewer.visualizations[event.target.value].setAttribute('foreground','')

    });

    viewer.ivcontrols.addEventListener('change', event => {
      var element = event.currentTarget;
      viewer.infoPanels.forEach(function(e,i) {
        e.style.display = 'none';
        e.removeAttribute('foreground')
      });

      viewer.infoPanels[event.target.value].style.display = 'block';
      viewer.infoPanels[event.target.value].setAttribute('foreground','');
    });


  }


  // @method propagateActiveIds()
  // @description Propagates the current active transcripts to the visualizations in
  //   the form of an attribute. The change should trigger an attribute change listener
  //   and fire the componentÄ™s handler.


  propagateActiveIds() {
    this.propagateAttributes('ddhi-active-id',this.activeIds.join());
  }

  // @method propagateSelectedEntity()
  // @description Propagates the id of a selected entity




  // @method render()
  // @description View method to display the component.

  render() {
    var item = this.getItemData();

    // Create Header

    var header = document.createElement('div');

    var title = document.createElement('h2')
    title.appendChild(document.createTextNode('DDHI Data Visualization Viewer'));

    var heading = document.createElement('h3')
    heading.appendChild(document.createTextNode(item.title.replace('Transcript of an Interview with a','').replace('Transcript of an Interview with',''))); // @todo: remove this ugly duct tape


    var idLabel = document.createElement('span');
    idLabel.classList.add('label');
    idLabel.appendChild(document.createTextNode('ID'));

    var idValue = document.createElement('span');
    idValue.classList.add('value');
    idValue.appendChild(document.createTextNode(item.id))

    var idWrapper = document.createElement('span');
    idWrapper.classList.add('metadata-field');
    idWrapper.appendChild(idLabel);
    idWrapper.appendChild(idValue);

    var metadata = document.createElement('span');
    metadata.classList.add('metadata');
    metadata.appendChild(idWrapper);

    header.appendChild(title);
    header.appendChild(heading);
    header.appendChild(metadata);

    this.renderValue(this.titleContainer,header.outerHTML);
  }

});


/**
 *  ddhi-entity-map element.
 *  Basic visualization for the entity browser. Will also serve as a model for other
 *  visualizations
 */

customElements.define('ddhi-entity-map', class extends DDHIVisualization {
  constructor() {
    super();
    this.mapElement; // Container
    this.map = null; // Leaflet map
    this.associatedPlaces;
    this.ids;
    this.multiInterview;

    // Attach a shadow root to <ddhi-entity-browser>.
    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = `
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css"
     integrity="sha512-xodZBNTC5n17Xt2atTPuE1HxjVMSvLVW9ocqUKLsCC5CXdbqCmblAshOMAS6/keqq/sMZMZ19scR4PsZChSR7A=="
     crossorigin=""/>
      <style>
        #mapid {
          width: 100%;
          height: 100%;
        }

        #downloads {
          padding: 0.75rem 0.75rem 0.75rem 0;
          cursor: pointer;
          background: no-repeat url('data:image/svg+xml;base64,PHN2ZyBhcmlhLWhpZGRlbj0idHJ1ZSIgZm9jdXNhYmxlPSJmYWxzZSIgZGF0YS1wcmVmaXg9ImZhcyIgZGF0YS1pY29uPSJkb3dubG9hZCIgY2xhc3M9InN2Zy1pbmxpbmUtLWZhIGZhLWRvd25sb2FkIGZhLXctMTYiIHJvbGU9ImltZyIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgNTEyIDUxMiI+PHBhdGggZmlsbD0iY3VycmVudENvbG9yIiBkPSJNMjE2IDBoODBjMTMuMyAwIDI0IDEwLjcgMjQgMjR2MTY4aDg3LjdjMTcuOCAwIDI2LjcgMjEuNSAxNC4xIDM0LjFMMjY5LjcgMzc4LjNjLTcuNSA3LjUtMTkuOCA3LjUtMjcuMyAwTDkwLjEgMjI2LjFjLTEyLjYtMTIuNi0zLjctMzQuMSAxNC4xLTM0LjFIMTkyVjI0YzAtMTMuMyAxMC43LTI0IDI0LTI0em0yOTYgMzc2djExMmMwIDEzLjMtMTAuNyAyNC0yNCAyNEgyNGMtMTMuMyAwLTI0LTEwLjctMjQtMjRWMzc2YzAtMTMuMyAxMC43LTI0IDI0LTI0aDE0Ni43bDQ5IDQ5YzIwLjEgMjAuMSA1Mi41IDIwLjEgNzIuNiAwbDQ5LTQ5SDQ4OGMxMy4zIDAgMjQgMTAuNyAyNCAyNHptLTEyNCA4OGMwLTExLTktMjAtMjAtMjBzLTIwIDktMjAgMjAgOSAyMCAyMCAyMCAyMC05IDIwLTIwem02NCAwYzAtMTEtOS0yMC0yMC0yMHMtMjAgOS0yMCAyMCA5IDIwIDIwIDIwIDIwLTkgMjAtMjB6Ij48L3BhdGg+PC9zdmc+');
          opacity: .5;
        }

        .leaflet-marker-icon {
          border-radius: 5px;
          margin-left: -7.5px !important;
          margin-top: -7.5px !important;
          width: 15px !important;
          height: 15px !important;
          transform: translate3d(107px, -192px, 0px);
          z-index: -192;
        }
        .one {
          background-color: red;
        }
        .two {
          background-color: blue;
        }
        .three {
          background-color: green
        }
      </style>
      
      <!-- div title="Download timeline" id="downloads" onclick="this.getRootNode().host.downloadMap()"></div -->
      <div id="mapid"></div>
    `;

    var leafletJS = document.createElement('script');
    leafletJS.setAttribute('src','https://unpkg.com/leaflet@1.7.1/dist/leaflet.js');
    leafletJS.setAttribute('integrity','sha512-XQoYMqMTK8LvdxXYG3nZ448hOEQiglfqkJs1NOQV44cWnUrBc8PkAOcXy20w0vlaXaVUearIOBhiXZ5V3ynxwA==');
    leafletJS.setAttribute('crossorigin','');
    this.shadowRoot.appendChild(leafletJS);

    var leafletExport = document.createElement('script');
    leafletExport.setAttribute('src','https://html2canvas.hertzen.com/dist/html2canvas.js');
    leafletExport.setAttribute('crossorigin','');
    leafletExport.setAttribute('type','text/javascript');
    this.shadowRoot.appendChild(leafletExport);

    var leafletExport2 = document.createElement('script');
    leafletExport2.setAttribute('src','https://cdnjs.cloudflare.com/ajax/libs/jspdf/1.5.3/jspdf.min.js');
    leafletExport2.setAttribute('crossorigin','');
    leafletExport2.setAttribute('type','text/javascript');
    this.shadowRoot.appendChild(leafletExport2);  

  }

  // @method connectedCallback()
  // @description Initializer method for this component.

  connectedCallback() {
    super.connectedCallback();
    this.mapElement = this.shadowRoot.querySelector('#mapid');
    // console.log('initializing map here', this.multiInterview)
    // this.multiInterview = await this.getAssociatedEntitiesByType(this,'multiInterview',this.getActiveIdFromAttribute(),'places');
  }


  // @method observedAttributes()
  // @description Lists the attributes to monitor. Listed attributes will
  //   trigger the attributeChangedCallback when their values change.
  // @return An array of monitored attributes.

  static get observedAttributes() {
    return ['ddhi-active-id','selected-entity','foreground'];
  }

  // @method attributeChangedCallback()
  // @description HTMLElement listener that detects changes to attributes. If the active
  //   ids are changed it triggers a transcript load process.

  async attributeChangedCallback(attrName, oldVal, newVal) {
    if(attrName == 'ddhi-active-id') {
      this.multiInterview;
      await this.getAssociatedEntitiesByType(this,'multiInterview',this.getActiveIdFromAttribute());
      this.ids = this.getActiveIdFromAttribute().split(',')
      this.createLeafletMap();
    }

    if(attrName == 'foreground' && this.map !== null) {
      this.map.invalidateSize();
    }
  }

  renderMarkerImage() {
    return "iVBORw0KGgoAAAANSUhEUgAAABUAAAAVCAYAAACpF6WWAAAACXBIWXMAAAsSAAALEgHS3X78AAAAgElEQVQ4jWP8//8/w5yTbwQYGBgMGCgDF1LMRT6ATGCcfeI1yLADDAwM/BQa+pGBgcEhxVzkAhMDA8MGKhjIADXjAMyl/6lgIDJwZKKygWAwauiooaOGjho6qA19ADJ0IhUNPJhiLvKAKcVcpABqMKg6IBeA9C5kYGAIYGBgYAAAnd0bgt9wuMEAAAAASUVORK5CYII=";
  }

  createLeafletMap() {
    var component = this;
    this.ids = this.getActiveIdFromAttribute().split(',')

    // Previous map
    if (this.map !== null) {
      this.map.off();
      this.map.remove();
    }

    // initialize Leaflet
    this.map = L.map(this.mapElement).setView({lon: 0, lat: 0}, 2);

    // Create icon

    var Icon = L.Icon.extend({
      options: {
        iconSize:     [15, 15],
        shadowSize:   [15, 15],
        iconAnchor:   [7.5, 7.5],
        shadowAnchor: [5.25, 5.25],
        popupAnchor:  [0, -15]
      }
    });


    

    // add the OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(component.map);

    // show the scale bar on the lower left corner
    L.control.scale().addTo(component.map);
    // TODO: Nest work
    
    this.ids.forEach(function(id,i) {
      var markerIcon = L.divIcon({className: 'leaflet-marker-icon'});
      var b = '1px ' + component.multiInterview[id].border + ' solid';
      var clr = component.multiInterview[id].color;
      component.associatedPlaces = component.multiInterview[id].places 
      component.associatedPlaces.forEach(function(e,i){
        if (e.location) {
  
          var marker = L.marker([e.location.lat,e.location.lng], {icon: markerIcon, id: e.id}).addTo(component.map);
  
          marker.bindPopup(e.title).on('click',function(e){
            if (e.target.options.id != null) {
              component.propagateAttributes('data-entity-index',0);
              component.propagateAttributes('selected-entity',e.target.options.id);
            }
          });
          marker.getElement().style.backgroundColor = clr;
          marker.getElement().style.border = b;
        }
      });
    });
    // var legend = L.control({position: 'bottomleft'});
    
    // var div = L.DomUtil.create('div', 'info legend');
    // let labels = ['<strong>Narrators</strong>'];
    // const c = ['red','blue','green'];

    // for (var i = 0; i < component.ids.length; i++) {

    //     div.innerHTML += 
    //     labels.push(
    //         '<i class="circle" style="background:' + c[i] + '"></i> ' +
    //     (component.ids[i] ? component.ids[i] : '+'));

    // }
    // div.innerHTML = labels.join('<br>');
    // div.addTo(legend);
    // legend.addTo(component.map);
    
  }

  // downloadMap() {
  //     console.log("Printing map!")
  //     var HTML_Width =  this.shadowRoot.querySelector('#mapid').width;
  //     var HTML_Height = this.shadowRoot.querySelector('#mapid').height;
  //     var top_left_margin = 15;
  //     var PDF_Width = HTML_Width + (top_left_margin * 2);
  //     var PDF_Height = (PDF_Width * 1.5) + (top_left_margin * 2);
  //     var canvas_image_width = HTML_Width;
  //     var canvas_image_height = HTML_Height;
  
  //     var totalPDFPages = Math.ceil(HTML_Height / PDF_Height) - 1;
      
  //     html2canvas(this.shadowRoot.querySelector('#mapid')).then(function (canvas) {
  //         var imgData = canvas.toDataURL("image/jpeg", 1.0);
  //         var pdf = new jsPDF('p', 'pt', [PDF_Width, PDF_Height]);
  //         pdf.addImage(imgData, 'JPG', top_left_margin, top_left_margin, canvas_image_width, canvas_image_height);
  //         for (var i = 1; i <= totalPDFPages; i++) { 
  //             pdf.addPage(PDF_Width, PDF_Height);
  //             pdf.addImage(imgData, 'JPG', top_left_margin, -(PDF_Height*i)+(top_left_margin*4),canvas_image_width,canvas_image_height);
  //         }
  //         pdf.save("Your_PDF_Name.pdf");
  //        // this.shadowRoot.querySelector('#mapid').hide();
  //     });
  // }

});

customElements.define('ddhi-timeline', class extends DDHIVisualization {
  constructor() {
    super();
    this.timelineContainer;
    this.timeline = null;
    this.timeline2 = null;
    this.currentChartType = null;
    this.associatedEntities;
    this.mentionedEntities;
    this.yZoom = 20;
    this.teiResource = null;
    this.eventData; 
    this.narrativeDownload = null;
    this.dateEntities = null;

    
    // Attach a shadow root to <ddhi-entity-browser>.
    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = `
      <style>
      :host {
          overflow: hidden;
          height: 100%;
        }
        
        * {
          transition: opacity 0.2s;
          --card-txt: #9BC8EB00;
        }
                
        .visualization {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 100%;
          overflow: auto;

        }
        
        .controls, .labels {
          height: 3rem;
          padding-bottom: var(--ddhi-viewer-padding, 1rem)
        }
        
        .controls {
          display: flex;
          flex-direction: row;
          justify-content: space-between; 
        }
        
        .controls > * {
          margin-right: var(--ddhi-viewer-padding, 1rem)  
        }

        .downloadOptions {
          padding-top: 30px;
          display: flex;
          flex-direction: row;
          justify-content: space-around; 
          align-items: center;
        }
        
        .downloadOptions > * {
          margin-right: var(--ddhi-viewer-padding, 1rem)  
        }

        .downloadOption {
          height: 1.8rem;
          display: table-cell;
          vertical-align: middle;
          font-size: 1rem;
          font-weight: 500;
        }
   
        .entity-grid {
          flex-shrink: 1;
          display: none;
          flex-direction: column;
          align-items: center;
          height: 100%;
          overflow-y: scroll;
          // width: 70%;
          width: 100%
        }

        // .proximity-modal {
        //   flex-shrink: 1;
        //   display: none;
        //   flex-direction: column;
        //   align-items: center;
        //   height: 100%;
        //   width: 30%;
        //   overflow-y: scroll;
        //   padding-left: 8px;
        //   border-left: 1px solid #E9E9E9;
        // }

        entity-card {
          display: flex;
          justify-content: center;
          width: 100%;
          margin-bottom: 1rem;
        }

        entity-card[data-entity-type='event'] {
          margin-bottom: 2.5rem;
        }

        #container {
          width: 100%;
          height: 100%;
          margin: 0px;
          padding: 0px 0px 12px 0px;
        }

        .threedtimeline {
          height: 90%;
          display: flex;
          flex-direction: row;
        }

        #container2 {
          width: 100%;
          height: 90%;
          margin: 0px;
          padding: 0px 0px 12px 0px;
          display: none;
          position: relative;
          top: -12px;
        }

        
        .devnote {
          font-size: 0.75rem;
          color: #99A2A3;
        }
        
        metadata-field {
          display: inline-block;
          margin-right: 1rem;
        }
        
        .metadata-field .label {
          text-transform: uppercase;
          font-size: 0.75rem;
          color: #919293;
          font-weight: 800;
          display: inline-block;
          margin-right: 0.25rem;
        }
        
        .metadata-field .value {
          font-size: 0.75rem;
          color: #4F5152;
        }
        
        .formlabel {
          color: #99A2A3;
          font-size: 0.75rem;
        }

        select {
          -webkit-appearance: none;
          -webkit-border-radius: 0;
          border-width: 0 0 2px 0;
          border-bottom-color: #9BC8EB;
          height: 2rem;
          width: 15rem;
          font-weight: 800;
          font-size: 0.75rem;
          padding-left: 0
        }
        
        option {
           font-size: 0.75rem;
        }

        .button-desc {
          font-size: 12px;
          font: "Roboto-Regular", Tahoma, sans-serif;
          color: #99A2A3;
          margin: 6px;
        }
            
        
        summary {
          writing-mode: vertical-lr;
          margin: 0.25rem  0 0.25rem  0.25rem;
          cursor: pointer;
          user-select: none;
          outline: none;
          transition: transform 200ms ease-in-out 0s;
        }
        summary::before,
        summary::after {
          position: static;
          top: 0;
          left: 0;
        }
        summary:hover {
          transform: scale(1.1);
        }
        summary::marker {
          font-size: 0;
        }
        summary::-webkit-details-marker {
          display: none;
        }
        details[open] .menu {
          animation-name: menuAnim;
        }

        .download-title {
          font-size: 10.5px;
          margin: 0.25rem !important;
          text-align: left;
        }
       
        .menu {
          height: 0;
          width: fit-content;
          border-radius: var(--cornerRad);
          background-color: #f7f7f7;
          box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.1);
          margin-top: 8px;
          margin-left: -52px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          animation: closeMenu 300ms ease-in-out forwards;
          position: relative;
          z-index: 100;
        }
        .menu div {
          font: "Roboto-Regular", Tahoma, sans-serif;
          padding: 0.25rem 0.75rem;
          margin: 0 1rem;
          border-bottom: 1px solid rgba(0, 0, 0, 0.2);
          text-align: center;
          cursor: pointer;
        }

        .menu div:nth-last-of-type(1) {
          border-bottom: none;
          padding-bottom: 0.35rem;
        }
        
        details::before {
          color: var(--secoColor);
          position: absolute;
          margin-left: 80px;
          padding: 10px 10px;
          opacity: 0.5;
        }
        details[open]::before {
          animation: fadeMe 300ms linear forwards;
        }
        @keyframes menuAnim {
          0% {
            height: 0;
          }
          100% {
            height: fit-content;
          }
        }
        @keyframes fadeMe {
          0% {
            opacity: 0.4;
          }
          100% {
            opacity: 0;
          }
        }

        #downloads {
          padding: 0.75rem 1.75rem 0.75rem 0;
          cursor: pointer;
          background: no-repeat url('data:image/svg+xml;base64,PHN2ZyBhcmlhLWhpZGRlbj0idHJ1ZSIgZm9jdXNhYmxlPSJmYWxzZSIgZGF0YS1wcmVmaXg9ImZhcyIgZGF0YS1pY29uPSJkb3dubG9hZCIgY2xhc3M9InN2Zy1pbmxpbmUtLWZhIGZhLWRvd25sb2FkIGZhLXctMTYiIHJvbGU9ImltZyIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgNTEyIDUxMiI+PHBhdGggZmlsbD0iY3VycmVudENvbG9yIiBkPSJNMjE2IDBoODBjMTMuMyAwIDI0IDEwLjcgMjQgMjR2MTY4aDg3LjdjMTcuOCAwIDI2LjcgMjEuNSAxNC4xIDM0LjFMMjY5LjcgMzc4LjNjLTcuNSA3LjUtMTkuOCA3LjUtMjcuMyAwTDkwLjEgMjI2LjFjLTEyLjYtMTIuNi0zLjctMzQuMSAxNC4xLTM0LjFIMTkyVjI0YzAtMTMuMyAxMC43LTI0IDI0LTI0em0yOTYgMzc2djExMmMwIDEzLjMtMTAuNyAyNC0yNCAyNEgyNGMtMTMuMyAwLTI0LTEwLjctMjQtMjRWMzc2YzAtMTMuMyAxMC43LTI0IDI0LTI0aDE0Ni43bDQ5IDQ5YzIwLjEgMjAuMSA1Mi41IDIwLjEgNzIuNiAwbDQ5LTQ5SDQ4OGMxMy4zIDAgMjQgMTAuNyAyNCAyNHptLTEyNCA4OGMwLTExLTktMjAtMjAtMjBzLTIwIDktMjAgMjAgOSAyMCAyMCAyMCAyMC05IDIwLTIwem02NCAwYzAtMTEtOS0yMC0yMC0yMHMtMjAgOS0yMCAyMCA5IDIwIDIwIDIwIDIwLTkgMjAtMjB6Ij48L3BhdGg+PC9zdmc+');
          opacity: .5;
        }

        .x-controls {
          display: inline-flex;
          justify-content: space-between;
          padding-right: 1.5rem;

        }

        .y-controls {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 24px;
          padding-right: 12px;
          justify-content: center;
          align-items: center;
        }

        .button-desc-y { 
          font-size: 12px;
          font: "Roboto-Regular", Tahoma, sans-serif;
          color: #99A2A3;
          margin: 6px;
        }
        #yZoomOutButton {
          transform: rotate(270deg);
          margin-bottom: 18px;
        }

        #yZoomInButton {
          transform: rotate(270deg);
          margin-top: 18px;
        }

        .transform-wrapper {
          transform: rotate(270deg);
          margin: 12px 0;
        }

        .minus {
          height: 1.8rem;
          border: 0;
          border-radius: 0.25rem;
          color: white;
          line-height: 1.2;
          white-space: nowrap;
          text-decoration: none;
          padding: 0.75rem 0.75rem;
          margin: 0.25rem;
          cursor: pointer;
          background: no-repeat url('data:image/svg+xml;base64,PHN2ZyBhcmlhLWhpZGRlbj0idHJ1ZSIgZm9jdXNhYmxlPSJmYWxzZSIgZGF0YS1wcmVmaXg9ImZhciIgZGF0YS1pY29uPSJtaW51cy1zcXVhcmUiIGNsYXNzPSJzdmctaW5saW5lLS1mYSBmYS1taW51cy1zcXVhcmUgZmEtdy0xNCIgcm9sZT0iaW1nIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NDggNTEyIj48cGF0aCBmaWxsPSJjdXJyZW50Q29sb3IiIGQ9Ik0xMDggMjg0Yy02LjYgMC0xMi01LjQtMTItMTJ2LTMyYzAtNi42IDUuNC0xMiAxMi0xMmgyMzJjNi42IDAgMTIgNS40IDEyIDEydjMyYzAgNi42LTUuNCAxMi0xMiAxMkgxMDh6TTQ0OCA4MHYzNTJjMCAyNi41LTIxLjUgNDgtNDggNDhINDhjLTI2LjUgMC00OC0yMS41LTQ4LTQ4VjgwYzAtMjYuNSAyMS41LTQ4IDQ4LTQ4aDM1MmMyNi41IDAgNDggMjEuNSA0OCA0OHptLTQ4IDM0NlY4NmMwLTMuMy0yLjctNi02LTZINTRjLTMuMyAwLTYgMi43LTYgNnYzNDBjMCAzLjMgMi43IDYgNiA2aDM0MGMzLjMgMCA2LTIuNyA2LTZ6Ij48L3BhdGg+PC9zdmc+');
          opacity: .5;
        }

        .plus {
          height: 1.8rem;
          border: 0;
          border-radius: 0.25rem;
          color: white;
          padding: 0.75rem 0.75rem;
          margin: 0.25rem;
          cursor: pointer;
          background: no-repeat url('data:image/svg+xml;base64,PHN2ZyBhcmlhLWhpZGRlbj0idHJ1ZSIgZm9jdXNhYmxlPSJmYWxzZSIgZGF0YS1wcmVmaXg9ImZhciIgZGF0YS1pY29uPSJwbHVzLXNxdWFyZSIgY2xhc3M9InN2Zy1pbmxpbmUtLWZhIGZhLXBsdXMtc3F1YXJlIGZhLXctMTQiIHJvbGU9ImltZyIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgNDQ4IDUxMiI+PHBhdGggZmlsbD0iY3VycmVudENvbG9yIiBkPSJNMzUyIDI0MHYzMmMwIDYuNi01LjQgMTItMTIgMTJoLTg4djg4YzAgNi42LTUuNCAxMi0xMiAxMmgtMzJjLTYuNiAwLTEyLTUuNC0xMi0xMnYtODhoLTg4Yy02LjYgMC0xMi01LjQtMTItMTJ2LTMyYzAtNi42IDUuNC0xMiAxMi0xMmg4OHYtODhjMC02LjYgNS40LTEyIDEyLTEyaDMyYzYuNiAwIDEyIDUuNCAxMiAxMnY4OGg4OGM2LjYgMCAxMiA1LjQgMTIgMTJ6bTk2LTE2MHYzNTJjMCAyNi41LTIxLjUgNDgtNDggNDhINDhjLTI2LjUgMC00OC0yMS41LTQ4LTQ4VjgwYzAtMjYuNSAyMS41LTQ4IDQ4LTQ4aDM1MmMyNi41IDAgNDggMjEuNSA0OCA0OHptLTQ4IDM0NlY4NmMwLTMuMy0yLjctNi02LTZINTRjLTMuMyAwLTYgMi43LTYgNnYzNDBjMCAzLjMgMi43IDYgNiA2aDM0MGMzLjMgMCA2LTIuNyA2LTZ6Ij48L3BhdGg+PC9zdmc+');
          opacity: .5;
        }

        .grid-container {
          display: flex;
          flex-direction: row;
          overflow-y: none;
          height: 90%;
        }

        .prox-modal-title {
          padding-bottom: 7%; 
        }

      </style>
      <div class='controls'>
          <div id='timeline-type'>
              <select>
                <option value='narrative'>Narrative Order</option>
                <option value='chronological'>Chronological Order</option>
                <option value='all'>Narrative Order vs. Chronological Order</option>
              </select>
              <div class='formlabel'>Timeline type</div>
          </div>

          
          <div class="range-controls">
            <div class="x-controls">
              <button class="control-button minus" id="xZoomOutButton" onclick="this.getRootNode().host.zoomOutX()"></button>
              <span class="button-desc">Chronological Scale</span>
              <button class="control-button plus" id="xZoomInButton" onclick="this.getRootNode().host.zoomInX()"></button>
            </div>
          </div>
          <details class="download-opts">
            <summary title="Download timeline" id="downloads"></summary>
            <nav class="menu"></nav>
          </details>  
      </div>

      <div class="threedtimeline">
        <div class="y-controls">
          <button class="control-button minus" id="yZoomOutButton" onclick="this.getRootNode().host.zoomOutY()"></button>
          <div class="transform-wrapper">
            <span class="button-desc-y">Interview</span>
          </div>
          <button class="control-button plus" id="yZoomInButton" onclick="this.getRootNode().host.zoomInY()"></button>
        </div>
        <div id="container"></div>
      </div>

      <div id="container2"></div>
      <!--div class="grid-container"-->
        <div class="entity-grid"></div>
        <!--div class="proximity-modal"></div-->
      <!--/div-->
    `;
    }
  
  // @method connectedCallback()
  // @description Initializer method for this component.
  
  connectedCallback() {
    super.connectedCallback();
    this.timelineContainer = this.shadowRoot.querySelector('#container');
    this.container2 = this.shadowRoot.querySelector('#container2');
    this.initFilters();
    this.initSort();
    this.filterEntities();
  }
  
    
    // @method observedAttributes()
    // @description Lists the attributes to monitor. Listed attributes will
    //   trigger the attributeChangedCallback when their values change.
    // @return An array of monitored attributes.
    
    static get observedAttributes() {
      return ['ddhi-active-id','selected-entity','entity-filter'];
    }
  
    // @method attributeChangedCallback()
    // @description HTMLElement listener that detects changes to attributes. If the active 
    //   ids are changed it triggers a transcript load process.
    
    /*
     *  A NOTE ON BUILD PROCESS
     *  - Entities are retrieved from the repo when the active id changes.
     *  - The indexEntities() method creates entity-card objects for each entity and adds them to a general index.
     *  - IndexEntities() also adds entity ids to sorted indices for retrieval during rendering
     *  - The render() process checks the value of the sort and filter controls, retrieves the values from the selected sort index, and renders.
     */
    
    async attributeChangedCallback(attrName, oldVal, newVal) {    
      if(attrName == 'ddhi-active-id') {
        await this.getItemDataById();
        this.getMentionedEntities();
        await this.getEventData();
        this.indexEntities();
        this.render();
        this.filterEntities();
      }
    }
    
     
    initFilters() {
      const filterElement = this.shadowRoot.querySelector('#timeline-type select');
      const downloadElement = this.shadowRoot.querySelector('#downloads');
      const downloadParent = this.shadowRoot.querySelector('.download-opts');

      var _this = this;
      
      this.changeViewer('narrative');
      this.currentChartType = 'narrative';   
        
      filterElement.addEventListener('change', event => {
        let timelineType = event.target.value;
        downloadParent.removeAttribute('open');
        this.changeViewer(timelineType); 
      });

      downloadElement.addEventListener('click', event => {
        this.createDownloadModal();
      });
    }

    initSort() {
      var _this = this;
    }


    async getItemDataById() {
      var component = this;
      
      this.itemsDataReset();
          
      var activeId = this.getActiveIdFromAttribute();
          
      if (activeId !== null) {
        component.tempResult = null;
        var response = await this.getAssociatedEntitiesByType(this,'multiInterview',activeId,'transcripts'); 
        this.itemsDataSetItem(activeId,component.tempResult);
        component.tempResult = null;
      }   

      return response;
    }

    changeViewer(timelineType) {      
      const currTimeline = this.shadowRoot.querySelector('.threedtimeline');
      const timelineWrap = this.shadowRoot.querySelector('#container');
      const entityGrid = this.shadowRoot.querySelector('.entity-grid');
      const timeline = this.shadowRoot.querySelector('#container2');
      // const prox = this.shadowRoot.querySelector('.proximity-modal');

      const rcontrol = this.shadowRoot.querySelector('.range-controls');


      this.currentChartType = timelineType;

      if(timelineType === 'all') {
        currTimeline.style.display = 'flex';
        timelineWrap.style.display = 'block';
        rcontrol.style.visibility = 'visible';

        entityGrid.style.display = 'none';
        // prox.style.display = 'none';
        timeline.style.display = 'none';
      }
      else if(timelineType === 'narrative') {
        currTimeline.style.display = 'none';
        timelineWrap.style.display = 'none';
        rcontrol.style.visibility = 'hidden';

        entityGrid.style.display = 'flex';
        // prox.style.display = 'flex';
        timeline.style.display = 'none';
      }
      else if(timelineType === 'chronological') {
        timeline.style.display = 'block';
        rcontrol.style.visibility = 'hidden';

        currTimeline.style.display = 'none';
        timelineWrap.style.display = 'none';
        entityGrid.style.display = 'none';
        // prox.style.display = 'none';
      }
    }

    removeAllChildNodes(parent) {
        while (parent.firstChild) {
            parent.removeChild(parent.firstChild);
        }
    }

    createDownloadModal() {
      var modal = this.shadowRoot.querySelector(".menu")
      this.removeAllChildNodes(modal);
      const downloadParent = this.shadowRoot.querySelector('.download-opts');
      var format = document.createElement('div');
      format.classList.add('download-title');
      var q = document.createTextNode("Select format:");
      format.appendChild(q);
      modal.appendChild(format);

      var dSvg = document.createElement('div');
      dSvg.value = 'svg';
      var t = document.createTextNode("SVG");
      dSvg.appendChild(t);
      dSvg.onclick = function () {
        this.getRootNode().host.downloadChart('svg');
        downloadParent.removeAttribute('open');
      }

      var dPng = document.createElement('div');
      dPng.value = 'png';
      var r = document.createTextNode("PNG");
      dPng.appendChild(r);
      dPng.onclick = function () {
        this.getRootNode().host.downloadChart('png');
        downloadParent.removeAttribute('open');
      }
      var dCsv = document.createElement('div');
      var s = document.createTextNode("CSV");
      dCsv.appendChild(s);
      dCsv.value = 'csv';
      dCsv.onclick = function () {
        this.getRootNode().host.downloadChart('csv');
        downloadParent.removeAttribute('open');
      }

      if (this.currentChartType === 'all') {
        modal.appendChild(dSvg);
        modal.appendChild(dPng);
      }
      else if (this.currentChartType === 'chronological') {
        modal.appendChild(dSvg);
        modal.appendChild(dPng);
        modal.appendChild(dCsv);
      }
      else if (this.currentChartType === 'narrative') {
        modal.appendChild(dCsv);
      }
    }

    createCsv(data, fileName) {
      let csvBody = 'appearance, event, start date, end date\n';
      data.forEach(item => {
        csvBody = csvBody + item.appearance + ', ' + item.name + ', ' + item.start + ', ' + item.end + '\n'
      })

      let csvContent = "data:text/csv;charset=utf-8," + csvBody;

      var encodedUri = encodeURI(csvContent);
      var link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      let name = fileName + '.csv';

      link.setAttribute("download", name);
      document.body.appendChild(link); 

      link.click();
    }

    downloadChart(downloadType) {
      let toDownload;

      let title = this.viewer.titleContainer.querySelector('h3');
      title = title.textContent.substring(1)
      title = title.replace(' ', '_');
      
      if (this.currentChartType === 'all') {
        toDownload = this.timeline;
        title = title + '_narrative_v_chronological';
      }
      else if (this.currentChartType === 'chronological') {
        toDownload = this.timeline2;
        title = title + '_chronological';
      }
      else if (this.currentChartType === 'narrative') {
        toDownload = this.narrativeDownload;
        // console.log("narrative download is", toDownload);
        title = title + '_narrative';
      }

      // console.log('Download type in change', downloadType);
      // console.log('Downloading type is', this.currentChartType)

      title = title + '_timeline'
      anychart.exports.filename(title); 
      
      if(downloadType === 'svg') {
        // console.log('SVG download of', this.currentChartType);
        toDownload.saveAsSvg();
      }
      else if(downloadType === 'png') {
        toDownload.saveAsPng();

      }
      else if(downloadType === 'csv') {
        if(this.currentChartType === 'narrative'){
          this.createCsv(toDownload, title);
        }
        else {
          toDownload.saveAsCsv();
        }
      }
    }
    
    
    filterEntities() {
      const grid = this.shadowRoot.querySelector('.entity-grid');
      const entities = this.shadowRoot.querySelectorAll('entity-card');
      
      const filterValue = 'all';
      
      grid.style.opacity = 0;
      
      window.setTimeout(function() { grid.style.display = 'none' }, this.heartbeat);
  
      entities.forEach(function(entity,i) {
      
        if (filterValue == 'all') {
          if (entity.getAttribute('data-entity-type') === 'date' || entity.getAttribute('data-entity-type') === 'event') {
            entity.style.display = 'block';
          } else {
          entity.style.display = 'none';
        }
      } else {
          if (entity.getAttribute('data-entity-type') == filterValue) {
            entity.style.display = 'block';
          } else {
            entity.style.display = 'none';
          }
        }
      });
      
      window.setTimeout(function() { grid.style.display = 'flex'; grid.style.opacity = 1 }, this.heartbeat * 2)
    }
    
    render() {
        
      const grid = this.shadowRoot.querySelector('.entity-grid');
      const entities = this.shadowRoot.querySelectorAll('entity-card');
      const sortValue = 'appearance';
      
      if (typeof this.sortIndex[sortValue] == 'undefined') {
        return;
      }
      
      grid.style.opacity = 0;
      
      window.setTimeout(function() { grid.style.display = 'none' }, this.heartbeat);
      
      // Empty grid
      while (grid.firstChild) {
        grid.removeChild(grid.firstChild);
      }    
      
      for (var i=0;i < this.sortIndex[sortValue].length;i++) {
        var id = this.sortIndex[sortValue][i].id;
        grid.appendChild(this.entityCardIndex[id]);
      }
      
      this.filterEntities();
      
      grid.style.opacity = 1;
      
      window.setTimeout(function() { grid.style.display = 'flex'; grid.style.opacity = 1 }, this.heartbeat * 2)
    }


    resetCharts() {
      // clears the current timelines to redraw with new data
      let chartContainer = this.shadowRoot.querySelector('#container');
      this.removeAllChildNodes(chartContainer);
      chartContainer = this.shadowRoot.querySelector('#container2');
      this.removeAllChildNodes(chartContainer);
    }


    indexEntities() {
      this.resetIndices();
      this.resetCharts();

      var _this = this;
      var item = this.getItemData();
      this.dateEntities = item.dates;
      var entityGrid = this.shadowRoot.querySelector('.entity-grid');
      
      entityGrid.textContent = '';
              
      // count appearances of a specific entity
      var entityMention = {};
      
      // count order of appearance
      var i = 1;
      const monthLengths = {
        '01': {name: 'January', start: '1', end: '31'},
        '02': {name: 'February', start: '1', end: '28'},
        '03': {name: 'March', start: '1', end: '31'},
        '04': {name: 'April', start: '1', end: '30'},
        '05': {name: 'May', start: '1', end: '31'},
        '06': {name: 'June', start: '1', end: '30'},
        '07': {name: 'July', start: '1', end: '31'},
        '08': {name: 'August', start: '1', end: '31'},
        '09': {name: 'September', start: '1', end: '30'},
        '10': {name: 'October', start: '1', end: '31'},
        '11': {name: 'November', start: '1', end: '30'},
        '12': {name: 'December', start: '1', end: '31'}
      }

      // create data for chart 
      var orderedEvents = [];
      var data = [];
      var timelineNamesList = [];
      var timelineRange = [];
      var dateRanges = [];

      var proximityModals = {};
      
      // Iterate over appearances by order of mention
      
      this.getEntitiesByOrderOfMention().forEach(function(id,i) {

        if (typeof _this.mentionedEntities[id] == 'undefined') {
          return;
        }
        
        var entity = _this.mentionedEntities[id];
        if (entity.resource_type === 'event' || entity.resource_type === 'date') {

          
          if (entityMention.hasOwnProperty(entity.id)) {
            entityMention[entity.id] ++;
          } else {
            entityMention[entity.id] = 1; // first appearance
          }
        
        
        // Create a new entity card, set attributes, and attach the entity data
        
          var entity = _this.mentionedEntities[id];
          var entityCard = document.createElement('entity-card');
            entityCard.setAttribute('data-title',entity.title);
            entityCard.setAttribute('data-entity-id',entity.id);
            entityCard.setAttribute('data-entity-type',entity.resource_type);
            entityCard.setAttribute('data-mention',entityMention[entity.id]);
            entityCard.setAttribute('data-appearance',i);
            entityCard.setData('entity',entity);
            entityCard.injectViewerObject(_this.viewer);
            
            // Add date information as attributes
          
          
          if (entity.resource_type === 'event' && _this.eventDateIndex.hasOwnProperty(entity.id)) {
            entityCard.setAttribute('data-start-date',_this.eventDateIndex[entity.id].startDate);
            entityCard.setAttribute('data-end-date',_this.eventDateIndex[entity.id].endDate);
            entityCard.setAttribute('data-point-in-time',_this.eventDateIndex[entity.id].pointInTime);
            entityCard.setAttribute('data-end-date',_this.eventDateIndex[entity.id].endDate);
            entityCard.setAttribute('data-sort-date-start',_this.eventDateIndex[entity.id].sortDateStart);
            entityCard.setAttribute('data-sort-date-end',_this.eventDateIndex[entity.id].sortDateEnd);

          }

          else if (entity.resource_type === 'date') {
            // var xmlDoc = new DOMParser().parseFromString(entity.utterance,'text/xml');
            // // console.log(xmlDoc);
            // proximityModals[entity.id] = [];
            // var dates = xmlDoc.getElementsByTagName("date");
            // var other = xmlDoc.getElementsByTagName("span");
            
            // if(dates.length !== 1) {
            //   for (let i = 0; i < dates.length; i++) {
            //     if(dates[i].getAttribute('id') !== entity.id){
            //       proximityModals[entity.id].push(dates[i]);
            //     }              
            //   }
            // }
            // for (let i = 0; i < other.length; i++) {
            //   proximityModals[entity.id].push(other[i]);                     
            // }

            entityCard.setAttribute('data-start-date',entity.startDate);
            entityCard.setAttribute('data-end-date', entity.endDate);
            entityCard.setAttribute('data-point-in-time',entity.pointInTime);
            entityCard.setAttribute('data-sort-date-start', entity.sortDateStart);
            entityCard.setAttribute('data-sort-date-end', entity.sortDateEnd);
            // @TODO: Add this functionality back in 
            // entityCard.addEventListener('click',() => {
            //   console.log("nearby entities are... ", proximityModals[entity.id]);
            //   _this.makeProximityModal(proximityModals[entity.id]);
            // });

          }

          if (entity.resource_type === 'event') {
            var timelineData = document.createElement('div');
            timelineData.setAttribute('slot','date-range');

            var label = document.createElement('div');
            label.setAttribute('slot','label');

            let start = entityCard.getAttribute('data-start-date');
            let end = entityCard.getAttribute('data-end-date');
            let point = entityCard.getAttribute('data-point-in-time');            
            var startTime, endTime;
  
            if(start == 'null' || end == 'null') {
              point = point.substring(1);
              let pointInTime = _this.dateParser(point, entity.title);

              startTime = pointInTime;
              endTime = pointInTime;

              timelineData.appendChild(document.createTextNode(pointInTime));

            }
            else if(point == 'null') {
              start = start.substring(1);
              startTime = _this.dateParser(start, entity.title);
  
              end = end.substring(1);
              endTime = _this.dateParser(end, entity.title);
              
              timelineData.appendChild(document.createTextNode(startTime + ' - ' + endTime));
            }
            else if(start != 'null' && end != 'null'&& point != 'null') {
              start = start.substring(1);
              startTime = _this.dateParser(start, entity.title);
  
              end = end.substring(1);
              
  
              endTime = _this.dateParser(end, entity.title);
             
              timelineData.appendChild(document.createTextNode(startTime + ' - ' + endTime));
            }
            else {
              timelineData.appendChild(document.createTextNode(' - '));
            }
            entityCard.appendChild(timelineData);
            
            var labelstr = entity.title.charAt(0).toUpperCase() + entity.title.slice(1);
            labelstr = labelstr.length > 35 ? labelstr.substring(0,30) + '...' : labelstr;
            label.appendChild(document.createTextNode(labelstr));

            entityCard.addEventListener('click',() => {
              const prox = _this.shadowRoot.querySelector('.proximity-modal');
              _this.removeAllChildNodes(prox);
            });


          } else if (entity.resource_type === 'date') {
            var label = document.createElement('div');
            label.setAttribute('slot','label');
                     
            var startTime, endTime;
  
            if(entity.when.length === 4) {
              startTime = entity.when + '-01-01';
              endTime = entity.when + '-12-31';
              label.appendChild(document.createTextNode(entity.when));
            }
            else if(entity.when.length === 7) {
              var month = entity.when.substring(5,7)
              startTime = entity.when + '-01';
              endTime = entity.when + '-' + monthLengths[month].end;
              label.appendChild(document.createTextNode(monthLengths[month].name + ' ' + entity.when.substring(0,4)));
            }
            else if(entity.when.length === 10) {
              var month = entity.when.substring(5,7)
              startTime = entity.when;
              endTime = entity.when;
              label.appendChild(document.createTextNode(monthLengths[month].name + ' ' + entity.when.substring(8,10) + ', ' + entity.when.substring(0,4)));
            }
          }
          
          i++; 
        
        
          
        var iconlabel = document.createElement('div');
          iconlabel.setAttribute('slot','iconlabel');
          iconlabel.appendChild(document.createTextNode(entityMention[entity.id]));
        
        var heading = document.createElement('h3');
          heading.appendChild(document.createTextNode(entity.title));
        
        var description = document.createElement('description');
        
        
        var contents = document.createElement('div');
          contents.setAttribute('slot','contents');
          contents.appendChild(heading);
          contents.appendChild(description);

          
        entityCard.appendChild(iconlabel);
        entityCard.appendChild(label);
        entityCard.appendChild(contents);
        
        
        _this.indexEntityByAttribute('data-appearance',entityCard,true,4);
  
        _this.entityCardIndex[entity.id] = entityCard;  // Add card to general index for lookup
        
        if (entity.resource_type === 'event' || entity.resource_type === 'date') {
          if (labelstr === 'Vietnam War') {
            startTime = "Jul 08 1959"
          }
          let toAdd = {};
          if (entity.resource_type === 'event') {
            toAdd = {
              id: i,
              name: labelstr,
              periods: [
                {id: entity.id, start: startTime, end: endTime, fill: "#9BC8EB", stroke: "#9BC8EB", selected: {fill: "#9BC8EB", stroke: "#9BC8EB"}}
              ],
              entity: entityCard,
              resource: entity.resource_type,
            }
          } else {
            toAdd = {
              id: i,
              name: labelstr,
              periods: [
                {id: entity.id, start: startTime, end: endTime, fill: "#186218", stroke: "#186218", selected: {fill: "#186218", stroke: "#186218"}}
              ],
              entity: entityCard,
              resource: entity.resource_type,
            }
          }
          if(entity.title) {

            
            let tempRange = {name: labelstr, start: startTime, end: endTime, entity: entityCard, resource: entity.resource_type}
            
            data.push(toAdd);
            timelineRange.push(tempRange);
            orderedEvents.push({appearance: orderedEvents.length + 1, name: labelstr, start: startTime, end: endTime});
          
            entityGrid.appendChild(entityCard);
          }
          //entityGrid.appendChild(entityCard);
        }

      }
      });

      timelineRange.forEach((c) => {
          if (!timelineNamesList.includes(c.name) && c.resource !== 'date') {
            timelineNamesList.push(c.name);
          }
      });

      let timelineMoments = []; 
      let timelineDataRanges = []; 

      timelineRange.forEach((c) => {
        if (timelineNamesList.includes(c.name)) {
          var search = timelineNamesList.indexOf(c.name);
          // TODO: Fix hard coding
          if(c.start === c.end && c.name !== 'Korean conflict' && c.resourse !== 'date') {
            timelineMoments.push({x: c.start, y: c.name, entity: c.entity});
          }
          else {
            timelineDataRanges.push(c);
          }
          timelineNamesList[search] = c;
        }
      });
      
      this.eventData = data;
      this.sortIndices();
      this.drawChart(data);
      this.drawTimeline(timelineDataRanges, timelineMoments);
      this.narrativeDownload = orderedEvents;
      // console.log("Proximity modals:", proximityModals);
    }
    
    resetIndices() {
      this.sortIndex = {};
      this.entityCardIndex = {};
    }


    // @ TODO: ADD this back in 
    // makeProximityModal(entityList) {
    //   let s = new Set()

    //   var _this = this;
    //   const prox = this.shadowRoot.querySelector('.proximity-modal');
    //   this.removeAllChildNodes(prox);

    //   var title = document.createElement('div');
    //   var t = document.createTextNode("Nearby Entities");
    //   title.classList.add('prox-modal-title');
    //   title.appendChild(t);
    //   prox.appendChild(title);

    //   for (let i = 0; i < entityList.length; i++) {
    //     var mult = false;
    //     var entId = entityList[i].getAttribute('id');
        
    //     if(!entId.includes('date')){
    //       entId = entId.substring(7, entId.length);
    //       console.log(entId);

    //       if(entId.charAt(entId.length - 1) !== '-') {
    //         mult = true;
    //         var mention = parseInt(entId.substring(entId.indexOf('-') + 1, entId.length))
    //         console.log(mention);
    //       }

    //       while(entId.includes('-')) {
    //         entId = entId.substring(0, entId.length - 1);
    //       }
    //     }
        
    //     //console.log(entId, this.mentionedEntities);
    //     if(!s.has(entId)) {
    //       s.add(entId);
    //       var entity = _this.mentionedEntities[entId];
    //       var entityCard = document.createElement('entity-card');
    //         entityCard.setAttribute('data-title',entity.title);
    //         entityCard.setAttribute('data-entity-id',entity.id);
    //         entityCard.setAttribute('data-entity-type',entity.resource_type);
    //         entityCard.setData('entity',entity);
    //         entityCard.injectViewerObject(_this.viewer);

    //         if(mult) {
    //           entityCard.setAttribute('data-mention', mention);
    //         }
    //         // Add date information as attributes
          
          
    //       if (entity.resource_type === 'event' && _this.eventDateIndex.hasOwnProperty(entity.id)) {
    //         entityCard.setAttribute('data-start-date',_this.eventDateIndex[entity.id].startDate);
    //         entityCard.setAttribute('data-end-date',_this.eventDateIndex[entity.id].endDate);
    //         entityCard.setAttribute('data-point-in-time',_this.eventDateIndex[entity.id].pointInTime);
    //         entityCard.setAttribute('data-end-date',_this.eventDateIndex[entity.id].endDate);
    //         entityCard.setAttribute('data-sort-date-start',_this.eventDateIndex[entity.id].sortDateStart);
    //         entityCard.setAttribute('data-sort-date-end',_this.eventDateIndex[entity.id].sortDateEnd);
            
    //       }

    //       if (entity.resource_type === 'event') {
    //         var timelineData = document.createElement('div');
    //         timelineData.setAttribute('slot','date-range');

    //         var label = document.createElement('div');
    //         label.setAttribute('slot','label');

    //         let start = entityCard.getAttribute('data-start-date');
    //         let end = entityCard.getAttribute('data-end-date');
    //         let point = entityCard.getAttribute('data-point-in-time');            
    //         var startTime, endTime;
  
    //         if(start == 'null' || end == 'null') {
    //           point = point.substring(1);
    //           let pointInTime = _this.dateParser(point, entity.title);

    //           startTime = pointInTime;
    //           endTime = pointInTime;

    //           timelineData.appendChild(document.createTextNode(pointInTime));

    //         }
    //         else if(point == 'null') {
    //           start = start.substring(1);
    //           startTime = _this.dateParser(start, entity.title);
  
    //           end = end.substring(1);
    //           endTime = _this.dateParser(end, entity.title);
              
    //           timelineData.appendChild(document.createTextNode(startTime + ' - ' + endTime));
    //         }
    //         else if(start != 'null' && end != 'null'&& point != 'null') {
    //           start = start.substring(1);
    //           startTime = _this.dateParser(start, entity.title);
  
    //           end = end.substring(1);
              
  
    //           endTime = _this.dateParser(end, entity.title);
             
    //           timelineData.appendChild(document.createTextNode(startTime + ' - ' + endTime));
    //         }
    //         else {
    //           timelineData.appendChild(document.createTextNode(' - '));
    //         }
    //         entityCard.appendChild(timelineData);
            
    //         var labelstr = entity.title.charAt(0).toUpperCase() + entity.title.slice(1);
    //         labelstr = labelstr.length > 35 ? labelstr.substring(0,30) + '...' : labelstr;
    //         label.appendChild(document.createTextNode(labelstr));
    //       }

    //       else if (entity.resource_type === 'date') {
            

    //         entityCard.setAttribute('data-start-date',entity.startDate);
    //         entityCard.setAttribute('data-end-date', entity.endDate);
    //         entityCard.setAttribute('data-point-in-time',entity.pointInTime);
    //         entityCard.setAttribute('data-sort-date-start', entity.sortDateStart);
    //         entityCard.setAttribute('data-sort-date-end', entity.sortDateEnd);
    //         var label = document.createElement('div');
    //         label.setAttribute('slot','label');
                     
    //         var startTime, endTime;
  
    //         if(entity.when.length === 4) {
    //           startTime = entity.when + '-01-01';
    //           endTime = entity.when + '-12-31';
    //           label.appendChild(document.createTextNode(entity.when));
    //         }
    //         else if(entity.when.length === 7) {
    //           var month = entity.when.substring(5,7)
    //           startTime = entity.when + '-01';
    //           endTime = entity.when + '-' + monthLengths[month].end;
    //           label.appendChild(document.createTextNode(monthLengths[month].name + ' ' + entity.when.substring(0,4)));
    //         }
    //         else if(entity.when.length === 10) {
    //           var month = entity.when.substring(5,7)
    //           startTime = entity.when;
    //           endTime = entity.when;
    //           label.appendChild(document.createTextNode(monthLengths[month].name + ' ' + entity.when.substring(8,10) + ', ' + entity.when.substring(0,4)));
    //         }
    //       }
    //       else {
    //         var label = document.createElement('div');
    //         label.setAttribute('slot','label');
    //         label.appendChild(document.createTextNode(entity.title));

    //       }

    //       var heading = document.createElement('h3');
    //       heading.appendChild(document.createTextNode(entity.title));
    //       var description = document.createElement('description');
          
    //       var contents = document.createElement('div');
    //         contents.setAttribute('slot','contents');
    //         contents.appendChild(heading);
    //         contents.appendChild(description);

            
    //       entityCard.appendChild(label);
    //       entityCard.appendChild(contents);
          
    //       prox.appendChild(entityCard);
    //   }
    //     }
        
    // }

    // @ TODO (important) parse dates based on local time 
    dateParser(rawDate, event) {
      const d = new Date(rawDate);

      if (d.toString() === 'Invalid Date') {

        let year = rawDate.substring(0,4);
        let month = rawDate.substring(5,7);
        let day = rawDate.substring(8,10);
        
        let date = ''
        if (year !== '0000') {
          date = date + year;
          if(month !== '00') {
            date = date + '-' + month;
          }
          if(day !== '00') {
            date = date + '-' + day;
          }
        }
        return date;
      }
      // Dates are coming out wrong with timezone
      if((event.includes('war') || event.includes('War')) && !event.includes('merica')) {
        let date = new Date(d.getTime() + 60*7*60000);
        //console.log(date)
        return date.toDateString().substring(4);
      }

      return d.toDateString().substring(4);
    }
    
    /**
     *  Generates sorted indices from entity-card DOM elements.
     *  Elements are added individually.
     *
     *  @param attr   The attribute
     */
    
    indexEntityByAttribute(attr,entity,reduce=true,padNumeric=0) {
          
      if (typeof this.sortIndex[attr] === "undefined") {
        this.sortIndex[attr] = [];
      }
      
      // Padding can help sort numbers properly.
      
      var key = padNumeric == 0 ? entity.getAttribute(attr) : String(entity.getAttribute(attr)).padStart(padNumeric,'0');
      
      var prop = {
        key: key,
        id: entity.getAttribute('data-entity-id')
      };
          
      function uniqueKey(a) {
        var seen = {};
        var out = [];
        var len = a.length;
        var j = 0;
        for(var i = 0; i < len; i++) {
          var key = a[i].key;
          if(seen[key] !== 1) {
            seen[key] = 1;
            out[j++] = a[i];
           }
        }
        return out;      
      }
            
      this.sortIndex[attr].push(prop);
      
      if (reduce === true) {
        this.sortIndex[attr] = uniqueKey(this.sortIndex[attr]);
      } 
    }
    
    indexEntityByFrequency(entity) {
      
      if (typeof this.sortIndex['data-mention'] == 'undefined') {
        this.sortIndex['data-mention'] = [];
      }
      
      var prop = {
        key: parseInt(entity.getAttribute('data-mention')), // key is the frequency of mentions
        id: entity.getAttribute('data-entity-id') // id is the id of the entity
      };
      
      // find the highest number of mentions
      
      function mostFrequentIndex(a) {
        var seen = {};
        var out = [];
        var len = a.length;
        for(var i = 0; i < len; i++) {
          var mcount = a[i].key; // mention count
          var id = a[i].id;
          if(typeof seen[id] === 'undefined' || mcount > seen[id]) {
            seen[id] = mcount; // capture the most frequent mention
          }
        }
        
        var j=0;
        for(var k = 0; k < len; k++) {
          var id = a[k].id;
          var key = a[k].key;
          if(seen[id] === key) { // if the highest number of mentions (seen) is the current entity mention count, output
            out[j++] = a[k];
           }
        }
        
        return out;      
      }
      
      this.sortIndex['data-mention'].push(prop);
      
      this.sortIndex['data-mention'] = mostFrequentIndex(this.sortIndex['data-mention']);
      
    }
    
    sortIndices() {
      
      function compare( a, b ) {      
        if ( a.key < b.key ){
          return -1;
        }
        if ( a.key > b.key ){
          return 1;
        }
        return 0;
      }
      
      function reverseCompare( a, b ) {      
        if ( a.key < b.key ){
          return 1;
        }
        if ( a.key > b.key ){
          return -1;
        }
        return 0;
      }
          
      for(const key in this.sortIndex) {      
        this.sortIndex[key].sort(key=='data-mention' ? reverseCompare : compare);
      }
      
    }
  
  drawChart(data) {      
      // create a data tree
      var treeData = anychart.data.tree(data, "as-tree");    
      // create a chart
      var chart = anychart.ganttResource(); 
      
      // set the data
      chart.data(treeData);   
      chart.background("#ffffff00");

      var periodLabels = chart.getTimeline().periods().labels();
      periodLabels.enabled(true);
      periodLabels.useHtml(true);
      // periodLabels.position('auto');

    
      
      periodLabels.fontWeight(400);
      periodLabels.format("{%name}");

      chart.container(this.timelineContainer);    

      chart.draw();   
      chart.rowStroke("0.0 #64b5f6");
      chart.columnStroke("0.0 #64b5f6");
      chart.getTimeline().scale().zoomLevels([
        [
          {unit: "month", count: 1},
          {unit: "year", count: 1},
          {unit: "year", count: 10}
        ]
      ]);

      var header = chart.getTimeline().header();
      header.level(0).enabled(true);
      header.level(0).height('0.4rem');
      header.level(1).enabled(true);
      header.level(2).enabled(true);

      // header.level(1).height('0.2rem');



      var column_1 = chart.dataGrid().column(0);
      column_1.enabled(false);

      var column_2 = chart.dataGrid().column(1);
      column_2.enabled(false);

      // var periods = chart.getTimeline().periods();
      // periods.selected() = periods.normal();
      
      
      chart.getTimeline().tooltip().format(
        "Start: {%start}{dateTimeFormat:dd MMM y} \nEnd: {%end}{dateTimeFormat:dd MMM y}"
      );

      chart.splitterPosition("0%");

      // fit elements to the width of the timeline
      chart.fitAll();  
      
      this.timeline = chart;
      this.graphEntityClicks();

  }

  // entity clicks 
  graphEntityClicks() {
    this.timeline.listen("rowClick", function(e){
      var entitycard = e['item'].get('entity');
      
      entitycard.propagateSelectedEntity(entitycard.id);
      if (entitycard.hasAttribute('data-mention')) {
        entitycard.propagateAttributes('data-entity-index',entitycard.getAttribute('data-mention') - 1);
      }
      entitycard.propagateSelectedEntity(entitycard.id);
    });
  }

  // zoom the timeline in
    zoomInX() {
      this.timeline.zoomIn(2);
    }

    // zoom the timeline out
    zoomOutX() {
      this.timeline.zoomOut(2);
    }

    zoomInY() {
      this.yZoom = this.yZoom + 3
      this.timeline.defaultRowHeight(this.yZoom);
    }

    // zoom the timeline out
    zoomOutY() {
      if (this.yZoom > 3) {
        this.yZoom = this.yZoom - 3;
      } 
      this.timeline.defaultRowHeight(this.yZoom);
    }

    drawTimeline(data, moments) {
      // create a chart
      var chart = anychart.timeline();
      chart.background("#ffffff00");

      var rangeSeries = chart.range(data);
      var momentSeries = chart.moment(moments);

      momentSeries.direction("down");
      momentSeries.normal().fill("#9BC8EB");
      momentSeries.selected().fill("#9BC8EB");
      momentSeries.normal().stroke("#9BC8EB");
      momentSeries.selected().stroke("#9BC8EB");
      
      rangeSeries.tooltip().title().enabled(false);
      rangeSeries.tooltip().separator().enabled(false);  

      rangeSeries.tooltip().format("{%name} \n\nStart: {%start}{dateTimeFormat:MMM dd y} \nEnd: {%end}{dateTimeFormat:MMM dd y}");
      rangeSeries.labels(true);
      rangeSeries.labels().fontWeight(400);
      rangeSeries.labels().format("{%name}");

      rangeSeries.normal().fill("#9BC8EB");
      rangeSeries.selected().fill("#9BC8EB");
      rangeSeries.normal().stroke("#2069a2");
      rangeSeries.selected().stroke("#2069a2");
      
      momentSeries.tooltip().title().enabled(false);
      momentSeries.tooltip().separator().enabled(false);  
      momentSeries.tooltip().format("{%y} \n\nDate: {%x}{dateTimeFormat:MMM dd y}");

      chart.title("Timeline of Transcript Events");

      chart.axis().height(50);

      // var zoomController = anychart.ui.zoom();
      // zoomController.target(chart);
      // zoomController.render();
      
      // chart.scale().zoomLevels([
      //   [
      //     {"unit": "month", count: 1},
      //     {"unit": "year", count: 1}
      //   ]
      // ]);

    

      chart.container(this.container2);    
      chart.draw(); 
      chart.scroller(true);  
      chart.fit();

      // // not working yet 
      // var zoomController = anychart.ui.zoom();
      // zoomController.target(chart);
      // zoomController.render();


      this.timeline2 = chart;
      this.timelineEntityClicks();

  }

  timelineEntityClicks() {
    this.timeline2.listen("pointClick", function(e){
      // console.log("Event click in timeline");
      var index = e.iterator.getIndex();
      var series = e.point.getSeries();
      series = series.zI

      // console.log(index, series);
      var entitycard = series[index].entity;
      
      entitycard.propagateSelectedEntity(entitycard.id);
      if (entitycard.hasAttribute('data-mention')) {
        entitycard.propagateAttributes('data-entity-index',entitycard.getAttribute('data-mention') - 1);
      }
      entitycard.propagateSelectedEntity(entitycard.id);
    });
  }
});