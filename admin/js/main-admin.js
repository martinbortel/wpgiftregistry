/******************************************************************
    _GLOBAL.JS
******************************************************************/
var global = (function($) {
    function debounce(func, wait, immediate) {
        var timeout;
        return function() {
            var context = this, args = arguments;
            var later = function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    }
    return { debounce: debounce };
})(jQuery);

/******************************************************************
    _EXAMPLE.JS
******************************************************************/
var example = (function($) { return {}; })(jQuery);

/******************************************************************
    adminJS
******************************************************************/
var adminJS = (function($) {

    var $box = $( '#wpgr_wishlist_repeat, #wishlist_group_repeat' );

    var replaceTitles = function() {
        $box.find( '.cmb-group-title' ).each( function() {
            var $this = $( this );
            var txt = $this.next().find( '[id$="gift_title"]' ).val();
            var rowindex;
            if ( ! txt ) {
                txt = $box.find( '[data-grouptitle]' ).data( 'grouptitle' );
                if ( txt ) {
                    rowindex = $this.parents( '[data-iterator]' ).data( 'iterator' );
                    txt = txt.replace( '{#}', ( rowindex + 1 ) );
                }
            }
            if ( txt ) { $this.text( txt ); }
        });
    };

    var setRadioDefaults = function( evt, $row ) {
        var iterator = $row.data('iterator');
        $('#wpgr_wishlist_' + iterator + '_gift_availability1').prop('checked', true);
    };

    var replaceOnKeyUp = function( evt ) {
        var $this = $( evt.target );
        var id = 'title';
        if ( evt.target.id.indexOf(id, evt.target.id.length - id.length) !== -1 ) {
            $this.parents( '.cmb-row.cmb-repeatable-grouping' ).find( '.cmb-group-title' ).text( $this.val() );
        }
    };

    $box
        .on( 'cmb2_add_row', setRadioDefaults )
        .on( 'cmb2_shift_rows_complete', replaceTitles )
        .on( 'keyup', replaceOnKeyUp );
    replaceTitles();

    $('a#reset-reserved-parts').on('click', function(e) {
        e.preventDefault();
        var $button = $(this);
        var giftID = $($button.parents('.cmb-field-list')[0]).find('.cmb2_unique_id').val();
        var wishlistID = $button.data('wishlist');
        var nonce = $button.data('nonce');
        $.ajax({
            url: variables.ajaxurl, type: 'POST', dataType: 'json',
            data: { action: 'reset_reserved_parts', wishlist_id: wishlistID, gift_id: giftID, nonce: nonce },
        }).done(function() {
            $button.after("&nbsp;<span style='color: #0073aa'>&#10003;</span>");
            $('.' + giftID).remove();
        });
    });

    function copyToClipboard(element) {
        var $temp = $("<input>");
        $("body").append($temp);
        $temp.val($(element).text()).select();
        document.execCommand("copy");
        $temp.remove();
    }
    $('.copy-to-clipboard').on('click', function(){ copyToClipboard($('code.shortcode')); });

})(jQuery);

/******************************************************************
    WPGR DRAG-AND-DROP GIFT REORDERING

    Uses SortableJS (window.Sortable, bundled in vendor.js) with
    forceFallback: true so it uses mouse events instead of the
    HTML5 native drag-and-drop API.

    Why forceFallback: SortableJS 1.5.1 defaults to nativeDraggable=true
    (HTML5 DnD). The native drop event only fires if every dragover
    handler on the drop target calls preventDefault(). In WP admin
    there are dragover handlers that do NOT call preventDefault()
    (postbox.js), causing the browser to revert the drag visually
    on drop. forceFallback=true uses mousemove/mouseup instead,
    which is completely independent of the HTML5 DnD lifecycle.

    Order persistence: data-iterator indices in new DOM order are
    POSTed via AJAX; PHP reindexes wpgr_wishlist post meta accordingly.
******************************************************************/
var wpgrDragSort = (function($) {

    var HANDLE_CLASS = 'wpgr-drag-handle';
    var sortableInst = null;

    function addHandles(container) {
        var rows = container.querySelectorAll(':scope > .cmb-repeatable-grouping');
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].querySelector('.' + HANDLE_CLASS)) { continue; }
            var h3 = rows[i].querySelector('h3.cmb-group-title');
            if (!h3) { continue; }
            var handle = document.createElement('span');
            handle.className = HANDLE_CLASS;
            handle.title = 'Drag to reorder';
            handle.innerHTML = '&#9776;';
            h3.insertBefore(handle, h3.firstChild);
        }
    }

    function saveOrder(container) {
        if (typeof variables === 'undefined' || !variables.wpgr_sort_nonce) { return; }
        var postId = parseInt((document.getElementById('post_ID') || {}).value, 10);
        if (!postId) { return; }

        var order = [];
        var rows = container.querySelectorAll(':scope > .cmb-repeatable-grouping');
        for (var i = 0; i < rows.length; i++) {
            var iter = parseInt(rows[i].getAttribute('data-iterator'), 10);
            if (!isNaN(iter)) { order.push(iter); }
        }
        if (!order.length) { return; }

        var wrap = container.closest
            ? (container.closest('.cmb-repeat-group-wrap') || container.parentNode)
            : container.parentNode;
        var saving = document.createElement('span');
        saving.className = 'wpgr-sort-saving';
        saving.innerHTML = 'Saving&#8230;';
        wrap.parentNode.insertBefore(saving, wrap);

        jQuery.ajax({
            url:  variables.ajaxurl,
            type: 'POST',
            data: {
                action:  'wpgr_save_gift_order',
                nonce:   variables.wpgr_sort_nonce,
                post_id: postId,
                order:   order,
            },
        }).done(function(response) {
            saving.parentNode && saving.parentNode.removeChild(saving);
            if (response && response.success) {
                var ok = document.createElement('span');
                ok.className = 'wpgr-sort-saved';
                ok.innerHTML = '&#10003; Order saved';
                wrap.parentNode.insertBefore(ok, wrap);
                setTimeout(function() {
                    jQuery(ok).fadeOut(400, function() {
                        ok.parentNode && ok.parentNode.removeChild(ok);
                    });
                }, 2000);
            }
        }).fail(function() {
            saving.parentNode && saving.parentNode.removeChild(saving);
        });
    }

    function initSortable(container) {
        if (sortableInst) { try { sortableInst.destroy(); } catch(e) {} sortableInst = null; }
        if (typeof window.Sortable === 'undefined') { return; }

        sortableInst = window.Sortable.create(container, {
            handle:          '.' + HANDLE_CLASS,
            draggable:       '.cmb-repeatable-grouping',
            animation:       150,
            forceFallback:   true,   // Use mouse events, not HTML5 DnD API
            fallbackOnBody:  true,   // Append drag helper to body during drag
            ghostClass:      'wpgr-sort-ghost',
            chosenClass:     'wpgr-sort-chosen',
            dragClass:       'wpgr-sort-drag',
            fallbackClass:   'wpgr-sort-fallback',
            onEnd: function(evt) {
                // Only save if the position actually changed.
                if (evt.oldIndex !== evt.newIndex) {
                    saveOrder(container);
                }
            },
        });
    }

    function init() {
        var container = document.getElementById('wpgr_wishlist_repeat') ||
                        document.getElementById('wishlist_group_repeat');
        if (!container) { return; }

        addHandles(container);
        initSortable(container);

        jQuery(container).on('cmb2_add_row', function() {
            setTimeout(function() {
                addHandles(container);
                initSortable(container);
            }, 200);
        });
    }

    jQuery(document).ready(init);
    return {};

})(jQuery);
