var url = require('url');
var jsdom = require('jsdom').jsdom;
var request = require('request');
var Q = require('q');

/**
 * From http://stackoverflow.com/a/7544757
 *
 * @param {String} mainUrl
 * @param {String} html
 */
function replace_all_rel_by_abs(mainUrl, html){

    // HTML/XML Attribute may not be prefixed by these characters (common
    // attribute chars.  This list is not complete, but will be sufficient
    // for this function (see http://www.w3.org/TR/REC-xml/#NT-NameChar).
    var att = "[^-a-z0-9:._]";
    var entityEnd = "(?:;|(?!\\d))";
    var ents = {
        " ": "(?:\\s|&nbsp;?|&#0*32" + entityEnd + "|&#x0*20" + entityEnd + ")",
        "(": "(?:\\(|&#0*40" + entityEnd + "|&#x0*28" + entityEnd + ")",
        ")": "(?:\\)|&#0*41" + entityEnd + "|&#x0*29" + entityEnd + ")",
        ".": "(?:\\.|&#0*46" + entityEnd + "|&#x0*2e" + entityEnd + ")"
    };

    // Placeholders to filter obfuscations
    var charMap = {};
    var shorthandCommonUse = ents[" "] + "*"; //Short-hand for common use
    var any = "(?:[^>\"']*(?:\"[^\"]*\"|'[^']*'))*?[^>]*";

    var slashRE = new RegExp(anyEnity("/"), 'g');
    var dotRE = new RegExp(anyEnity("."), 'g');

    // Important: Must be pre- and postfixed by < and >.
    // This RE should match anything within a tag!
    /**
     * Any Entity - Returns a RE-pattern to deal with HTML entities.
     * @name ae
     * @description Converts a given string in a sequence of the original input and the HTML entity
     * @param {String} string  String to convert
     */
    function anyEnity(string){
        var all_chars_lowercase = string.toLowerCase();
        if(ents[string]) return ents[string];
        var all_chars_uppercase = string.toUpperCase();
        var RE_res = "";
        for(var i=0; i<string.length; i++){
            var char_lowercase = all_chars_lowercase.charAt(i);
            if(charMap[char_lowercase]){
                RE_res += charMap[char_lowercase];
                continue;
            }
            var char_uppercase = all_chars_uppercase.charAt(i);
            var RE_sub = [char_lowercase];
            RE_sub.push("&#0*" + char_lowercase.charCodeAt(0) + entityEnd);
            RE_sub.push("&#x0*" + char_lowercase.charCodeAt(0).toString(16) + entityEnd);
            if(char_lowercase != char_uppercase){
                // Note: RE ignorecase flag has already been activated
                RE_sub.push("&#0*" + char_uppercase.charCodeAt(0) + entityEnd);
                RE_sub.push("&#x0*" + char_uppercase.charCodeAt(0).toString(16) + entityEnd);
            }
            RE_sub = "(?:" + RE_sub.join("|") + ")";
            RE_res += (charMap[char_lowercase] = RE_sub);
        }
        return(ents[string] = RE_res);
    }

    /**
     * @name by
     * @description  2nd argument for replace().
     *
     * @param {String} match
     * @param {String} group1
     * @param {String} group2
     * @param {String} group3
     */
    function by(match, group1, group2, group3){
        group2 = url.resolve(mainUrl, group2);
        return group1 + group2 + group3;
    }

    /**
     * @name by2
     * @description  2nd argument for replace(). Parses relevant HTML entities
     *
     * @param {String} match
     * @param {String} group1
     * @param {String} group2
     * @param {String} group3
     */
    function by2(match, group1, group2, group3){
        group2 = group2.replace(slashRE, "/").replace(dotRE, ".");
        group2 = url.resolve(mainUrl, group2);
        return group1 + group2 + group3;
    }

    /**
     * Create Replace - Creates and executes a search-and-replace
     * @name cr
     * @description Selects a HTML element and performs a
     * search-and-replace on attributes
     * @param {String} selector  HTML substring to match
     * @param {String} attribute RegExp-escaped; HTML element attribute to match
     * @param {String} marker Optional RegExp-escaped; marks the prefix
     * @param {String} delimiter Optional RegExp escaped; non-quote delimiters
     * @param {String} end Optional RegExp-escaped; forces the match to end before an occurence of <end>
     */
    function cr(selector, attribute, marker, delimiter, end){
        if(typeof selector == "string") selector = new RegExp(selector, "gi");
        attribute = att + attribute;
        marker = typeof marker == "string" ? marker : "\\s*=\\s*";
        delimiter = typeof delimiter == "string" ? delimiter : "";
        end = typeof end == "string" ? "?)("+end : ")(";
        var re1 = new RegExp('(' + attribute + marker + '")([^"' + delimiter + ']+' + end + ')', 'gi');
        var re2 = new RegExp("(" + attribute + marker + "')([^'" + delimiter + "]+" + end + ")", 'gi');
        var re3 = new RegExp('(' + attribute + marker + ')([^"\'][^\\s>' + delimiter + ']*' + end + ')', 'gi');
        html = html.replace(selector, function(match){
            return match.replace(re1, by).replace(re2, by).replace(re3, by);
        });
    }

    /**
     * Create Replace Inline - Creates and executes a search-and-replace.
     * @name cri
     * @description Selects an attribute of a HTML element, and performs a search-and-replace on certain values
     * @param {String} selector  HTML element to match
     * @param {String} attribute RegExp-escaped; HTML element attribute to match
     * @param {String} front RegExp-escaped; attribute value, prefix to match
     * @param {String} flags Optional RegExp flags, default "gi"
     * @param {String} delimiter Optional RegExp-escaped; non-quote delimiters
     * @param {String} end Optional RegExp-escaped; forces the match to end before an occurence of <end>
     */
    function cri(selector, attribute, front, flags, delimiter, end){
        if(typeof selector == "string") selector = new RegExp(selector, "gi");
        attribute = att + attribute;
        flags = typeof flags == "string" ? flags : "gi";
        var re1 = new RegExp('(' + attribute + '\\s*=\\s*")([^"]*)', 'gi');
        var re2 = new RegExp("(" + attribute + "\\s*=\\s*')([^']+)", 'gi');
        var at1 = new RegExp('(' + front + ')([^"]+)(")', flags);
        var at2 = new RegExp("(" + front + ")([^']+)(')", flags);
        var handleAttr;
        if(typeof delimiter == "string"){
            end = typeof end == "string" ? end : "";
            var at3 = new RegExp("(" + front + ")([^\"'][^" + delimiter + "]*" + (end ? "?)(" + end + ")" : ")()"), flags);
            handleAttr = function(match, g1, g2){
                return g1 + g2.replace(at1, by2).replace(at2, by2).replace(at3, by2);
            };
        } else {
            handleAttr = function(match, g1, g2){
                return g1 + g2.replace(at1, by2).replace(at2, by2)
            };
        }
        html = html.replace(selector, function(match){
            return match.replace(re1, handleAttr).replace(re2, handleAttr);
        });
    }

    // <meta http-equiv=refresh content="  ; url= " >
    cri("<meta"+any+att+"http-equiv\\s*=\\s*(?:\""+anyEnity("refresh")+"\""+any+">|'"+anyEnity("refresh")+"'"+any+">|"+anyEnity("refresh")+"(?:"+anyEnity(" ")+any+">|>))", "content", anyEnity("url")+shorthandCommonUse+anyEnity("=")+shorthandCommonUse, "i");

    cr("<"+any+att+"href\\s*="+any+">", "href"); // Linked elements
    cr("<"+any+att+"src\\s*="+any+">", "src"); // Embedded elements

    cr("<object"+any+att+"data\\s*="+any+">", "data"); // <object data= >
    cr("<applet"+any+att+"codebase\\s*="+any+">", "codebase"); // <applet codebase= >

    // <param name=movie value= >/
    cr("<param"+any+att+"name\\s*=\\s*(?:\""+anyEnity("movie")+"\""+any+">|'"+anyEnity("movie")+"'"+any+">|"+anyEnity("movie")+"(?:"+anyEnity(" ")+any+">|>))", "value");

    cr(/<style[^>]*>(?:[^"']*(?:"[^"]*"|'[^']*'))*?[^'"]*(?:<\/style|$)/gi, "url", "\\s*\\(\\s*", "", "\\s*\\)"); // <style>
    cri("<"+any+att+"style\\s*="+any+">", "style", anyEnity("url")+shorthandCommonUse+anyEnity("(")+shorthandCommonUse, 0, shorthandCommonUse+anyEnity(")"), anyEnity(")")); // < style=" url(...) " >
    return html;
}

/**
 * DO REQUEST
 *
 * @param {String} urlToScrap
 */
function doRequest(urlToScrap){
    var df = Q.defer();
    request(urlToScrap, function (err, response, body) {
        if(err){
            df.reject(err);
        }else{
            df.resolve({response: response, body: body});
        }
    });
    return df.promise;
}

/**
 * CONVER BODY TO DOM
 *
 * @param {String} body
 */
function convertToDOM(body){
    var df = Q.defer();
    jsdom.env(body, function (errors, window) {
        var html = window.document.documentElement.innerHTML;
        df.resolve(html);
    });
    return df.promise;
}

/**
 * USE CASE FOR SCRAP CONTENT
 *
 * @param {String} urlToScrap
 */
function scrapContent(urlToScrap){
    return doRequest(urlToScrap)
        .then(function(details){
            var response = details.response,
                body = details.body;
            if(!response.headers['x-frame-options']){
                return '';
            }else{
                if (response.statusCode == 200) {
                    return convertToDOM(body)
                        .then(function(html){
                            return replace_all_rel_by_abs(urlToScrap, html);
                        });
                }else{
                    throw new Error('ERROR!');
                }
            }
        });
}
module.exports = scrapContent;
