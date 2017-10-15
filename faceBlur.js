const async = require('async'),
      AWS   = require('aws-sdk'),
      gm    = require('gm').subClass({ imageMagick: true });

const s3          = new AWS.S3();
const rekognition = new AWS.Rekognition();

const destDir     = 'no-face';

exports.handler = (event, context, callback) => {
  const srcBucket = event.Records[0].s3.bucket.name;
  const srcKey    = event.Records[0].s3.object.key;

  async.waterfall([
    function download(next) {
      s3.getObject({
        Bucket: srcBucket,
        Key: srcKey
      }, next);
    },

    function detectFaces(response, next) {
      var params = {
        Image: {
          S3Object: {
            Bucket: srcBucket,
            Name: srcKey
          }
        },
        Attributes: ['DEFAULT']
      };

      rekognition.detectFaces(params, (err, data) => {
        if (err){
          next(err);
        } else {
          next(null, response, data.FaceDetails);
        }
      });
    },

    function blur(response, faceDetails, next) {
      let img = gm(response.Body);

      img.size(function(err, value){
        if (err) {
          next(err);
        } else {
          faceDetails.forEach((faceDetail) => {
            const box    = faceDetail.BoundingBox,
                  width  = box.Width * value.width,
                  height = box.Height * value.height,
                  left   = box.Left * value.width,
                  top    = box.Top * value.height;

            img.region(width, height, left, top).blur(0, 50);
          });

          img.toBuffer(function(err, buffer) {
            if(err) {
              next(err);
            } else {
              next(null, response.ContentType, buffer);
            }
          });
        }
      });
    },

    function putObject(contentType, buffer, next) {
      let dest = srcKey.split("/");
      dest.shift();
      dest.unshift(destDir);

      let destKey = dest.join("/");

      let obj = { Bucket : srcBucket, Key: destKey, Body : buffer, ContentType : contentType, ACL:'public-read' };

      s3.putObject(obj, function(err, result) {
        if (err) {
          next(err);
        } else {
          next(null);
        }
      });
    }
  ],

  function (err) {
    if (err) {
      console.error(err);
      callback(err);
    } else {
      callback(null, 'success');
    }
  });
};
