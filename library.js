(function(module) {
	"use strict";

	var user = module.parent.require('./user'),
		meta = module.parent.require('./meta'),
		db = module.parent.require('../src/database'),
		passport = module.parent.require('passport'),
		passportTwitter = require('passport-twitter').Strategy,
		fs = module.parent.require('fs'),
		path = module.parent.require('path'),
		nconf = module.parent.require('nconf'),
		async = module.parent.require('async');

	var constants = Object.freeze({
		'name': "Twitter",
		'admin': {
			'route': '/plugins/sso-twitter',
			'icon': 'fa-twitter-square'
		}
	});

	var Twitter = {};

	Twitter.init = function(data, callback) {
		function render(req, res, next) {
			res.render('admin/plugins/sso-twitter', {});
		}

		data.router.get('/admin/plugins/sso-twitter', data.middleware.admin.buildHeader, render);
		data.router.get('/api/admin/plugins/sso-twitter', render);

		callback();
	};

	Twitter.getStrategy = function(strategies, callback) {
		if (meta.config['social:twitter:key'] && meta.config['social:twitter:secret']) {
			passport.use(new passportTwitter({
				consumerKey: meta.config['social:twitter:key'],
				consumerSecret: meta.config['social:twitter:secret'],
				callbackURL: nconf.get('url') + '/auth/twitter/callback'
			}, function(token, tokenSecret, profile, done) {
				Twitter.login(profile.id, profile.username, profile.photos, function(err, user) {
					if (err) {
						return done(err);
					}
					done(null, user);
				});
			}));

			strategies.push({
				name: 'twitter',
				url: '/auth/twitter',
				callbackURL: '/auth/twitter/callback',
				icon: constants.admin.icon,
				scope: ''
			});
		}

		callback(null, strategies);
	};

	Twitter.login = function(twid, handle, photos, callback) {
		Twitter.getUidByTwitterId(twid, function(err, uid) {
			if(err) {
				return callback(err);
			}

			if (uid !== null) {
				// Existing User
				callback(null, {
					uid: uid
				});
			} else {
				// New User
				user.create({username: handle}, function(err, uid) {
					if(err) {
						return callback(err);
					}

					// Save twitter-specific information to the user
					user.setUserField(uid, 'twid', twid);
					db.setObjectField('twid:uid', twid, uid);

					// Save their photo, if present
					if (photos && photos.length > 0) {
						var photoUrl = photos[0].value;
						photoUrl = path.dirname(photoUrl) + '/' + path.basename(photoUrl, path.extname(photoUrl)).slice(0, -6) + 'bigger' + path.extname(photoUrl);
						user.setUserField(uid, 'uploadedpicture', photoUrl);
						user.setUserField(uid, 'picture', photoUrl);
					}

					callback(null, {
						uid: uid
					});
				});
			}
		});
	};

	Twitter.getUidByTwitterId = function(twid, callback) {
		db.getObjectField('twid:uid', twid, function(err, uid) {
			if (err) {
				return callback(err);
			}
			callback(null, uid);
		});
	};

	Twitter.addMenuItem = function(custom_header, callback) {
		custom_header.authentication.push({
			"route": constants.admin.route,
			"icon": constants.admin.icon,
			"name": constants.name
		});

		callback(null, custom_header);
	};

	Twitter.deleteUserData = function(uid, callback) {
		async.waterfall([
			async.apply(user.getUserField, uid, 'twid'),
			function(oAuthIdToDelete, next) {
				db.deleteObjectField('twid:uid', oAuthIdToDelete, next);
			}
		], function(err) {
			if (err) {
				winston.error('[sso-twitter] Could not remove OAuthId data for uid ' + uid + '. Error: ' + err);
				return callback(err);
			}
			callback(null, uid);
		});
	};

	module.exports = Twitter;
}(module));
