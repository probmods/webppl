module.exports = function(env) {

    function myGetAddress(store, k, address){
	return k(store, address);
    };

    return { myGetAddress: myGetAddress };

};
