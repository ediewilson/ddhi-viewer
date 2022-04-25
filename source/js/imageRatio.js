/**
 *  @file imageRatio.js
 *
 *  Audits page images and adds a class indicating their width to height ratio.
 *
 *  Requires: imagesloaded and ev-emitter packages (load via NPM).
 *
 */
(function($) {    

  $(document).ready(function() {
    
    // An instance has been found where the imagesLoaded function is returning undefined.
    // This is not consistent – so far it only appears when the Universal Viewer is loaded.
    // @todo: Continue to investigate. In the meantime perform the required checks.
    
    $('main, #splash, #title').each(function() {	    
      if (typeof $(this).imagesLoaded === 'function') {  
        $(this).imagesLoaded(function(){    
          $(this.images).each(function(i,o) {
            var img = $(o.img);
                  
            var h = o.img.naturalHeight;
            var w = o.img.naturalWidth
            var aspectClass = getImageAspectClass(h,w);
                
            img.addClass('img-' + aspectClass);
            
            img.closest('figure').addClass('figure-' + aspectClass);
            
            if (img.parent('a').length > 0) {
              img.parent('a').addClass('a-' + aspectClass);
            }
          });        
        });
      } else {
	    	console.log('imagesLoaded JS library not found.')
      }
    });
  
  });
  
  function getImageAspectClass(h,w) {
    var aspectClass = 'square';
    
    if (w > h) {
      aspectClass = 'landscape';
    } else if (h > w) {
      aspectClass = 'portrait';
    }
    
    return aspectClass;
  }
})(jQuery);
