﻿/*
* World's Smallest h.264 Encoder, by Ben Mesander.
*
* For background, see the post http://cardinalpeak.com/blog?p=488
*
* Copyright (c) 2010, Cardinal Peak, LLC.  http://cardinalpeak.com
*
* Redistribution and use in source and binary forms, with or without
* modification, are permitted provided that the following conditions
* are met:
*
* 1) Redistributions of source code must retain the above copyright
*    notice, this list of conditions and the following disclaimer.
*
* 2) Redistributions in binary form must reproduce the above
*    copyright notice, this list of conditions and the following
*    disclaimer in the documentation and/or other materials provided
*    with the distribution.
*
* 3) Neither the name of Cardinal Peak nor the names of its
*    contributors may be used to endorse or promote products derived
*    from this software without specific prior written permission.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
* "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
* LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
* FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL
* CARDINAL PEAK, LLC BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
* SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
* LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF
* USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
* ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
* OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
* OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
* SUCH DAMAGE.
*/
//interface SourceBuffer {
//    appendImageData(imageData: ImageData, timeStamp: number): void;
//}
//SourceBuffer.prototype.appendImageData = (imageData: ImageData, timeStamp: number) => {
//}
var _H264LosslessEncoder = (function () {
    function _H264LosslessEncoder() {
    }
    _H264LosslessEncoder.encodeFrame = function (imageData) {
        var frame = Array.prototype.concat(this.SPS, this.PPS);

        for (var i = 0; i < imageData.data.byteLength; i += 4) {
            var yuv = this.convertToYUV(imageData.data.subarray(i, i + 4));
            Array.prototype.push.apply(frame, this.sliceHeader);
        }

        frame.push(0x80);
        return new Uint8Array(frame);
    };
    _H264LosslessEncoder.convertToYUV = function (rgba) {
        var r = rgba[0], g = rgba[1], b = rgba[2];

        //alpha will be ignored
        return [
            0.299 * r + 0.587 * g + 0.114 * b,
            -0.14713 * r - 0.28886 * g + 0.436 * b,
            0.615 * r - 0.51499 * g - 0.10001 * b
        ];
    };
    _H264LosslessEncoder.SPS = [0x00, 0x00, 0x00, 0x01, 0x67, 0x42, 0x00, 0x0A, 0xF8, 0x41, 0xA2];
    _H264LosslessEncoder.PPS = [0x00, 0x00, 0x00, 0x01, 0x68, 0xCE, 0x38, 0x80];
    _H264LosslessEncoder.sliceHeader = [0x00, 0x00, 0x00, 0x01, 0x05, 0x88, 0x84, 0x21, 0xA0];
    _H264LosslessEncoder.macroblockHeader = [0x0D, 0x00];
    return _H264LosslessEncoder;
})();
var MJPEGPlayer = (function () {
    function MJPEGPlayer() {
        this._autoplay = false;
        this._src = null;
        this.onloadedmetadata = null;
        this.onseeked = null;
        /** Stops playing when set to true, automatically returning to false */
        this._playSessionToken = null;
        this._currentVideoTime = -1;
    }
    MJPEGPlayer._promiseImmediate = function () {
        return new Promise(function (resolve, reject) {
            window.setImmediate(function () {
                resolve(undefined);
            });
        });
    };

    Object.defineProperty(MJPEGPlayer.prototype, "autoplay", {
        get: function () {
            return this._autoplay;
        },
        set: function (value) {
            this._autoplay = Boolean(value);
        },
        enumerable: true,
        configurable: true
    });

    Object.defineProperty(MJPEGPlayer.prototype, "element", {
        get: function () {
            if (!this._element) {
                this._element = document.createElement("img");
                this._element.player = this;
            }
            return this._element;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(MJPEGPlayer.prototype, "src", {
        get: function () {
            return this._srcUrl;
        },
        set: function (url) {
            var _this = this;
            this.pause();
            this._src = null;
            this._srcUrl = url;

            if (url.length > 0)
                this._getBlobFromUrl(url).then(function (blob) {
                    return MJPEGReader.read(blob);
                }).then(function (video) {
                    _this._src = video;
                    return _this._show(0);
                }).then(function () {
                    if (_this.onloadedmetadata)
                        _this.onloadedmetadata(_this._createEvent());
                });
            else {
                this._currentVideoTime = -1; // blocks further rendering
                this.pause();
                this.element.src = ""; // clear image element
            }
        },
        enumerable: true,
        configurable: true
    });
    MJPEGPlayer.prototype._getBlobFromUrl = function (url) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.onload = function (e) {
                resolve(xhr.response);
            };
            xhr.open("GET", url);
            xhr.responseType = "blob";
            xhr.send();
        });
    };

    Object.defineProperty(MJPEGPlayer.prototype, "currentTime", {
        get: function () {
            return Math.max(this._currentVideoTime, 0);
        },
        set: function (time) {
            var _this = this;
            this._waitToPlay().then(function () {
                return _this._show(time);
            }).then(function () {
                if (_this.onseeked)
                    _this.onseeked(_this._createEvent());
            });
        },
        enumerable: true,
        configurable: true
    });

    MJPEGPlayer.prototype._show = function (time) {
        var _this = this;
        this._currentVideoTime = time;
        return this._src.getFrameByTime(time).then(function (frame) {
            if (_this._currentVideoTime == time)
                _this.element.src = URL.createObjectURL(frame, { oneTimeOnly: true });
        }, function () {
        });
    };
    MJPEGPlayer.prototype._waitToPlay = function () {
        var _this = this;
        var source = this._srcUrl;
        return new Promise(function (resolve, reject) {
            var next = function () {
                if (_this._src)
                    return resolve(undefined);
                if (source !== _this._srcUrl)
                    return reject(new Error("Play cancelled"));

                MJPEGPlayer._promiseImmediate().then(next);
            };
            next();
        });
    };
    MJPEGPlayer.prototype.play = function () {
        var _this = this;
        if (this._playSessionToken)
            return;
        var token = this._playSessionToken = { stop: false };

        this._waitToPlay().then(function () {
            var referenceTime = Date.now() / 1000;
            var referenceVideoTime = _this._currentVideoTime;

            var next = function () {
                if (token.stop) {
                    _this._playSessionToken = null;
                    return;
                }

                var targetTime = referenceVideoTime + Date.now() / 1000 - referenceTime;
                if (targetTime - _this._currentVideoTime > 0.1) {
                    referenceTime = Date.now() / 1000; // reset the reference to the current time
                    referenceVideoTime = _this._currentVideoTime;
                    targetTime = referenceVideoTime + 0.1; // limit the delay to 0.1 s (100 ms)
                }
                if (targetTime < _this._src.duration)
                    _this._show(targetTime).then(MJPEGPlayer._promiseImmediate).then(next);
                else {
                    _this._show(_this._src.duration).then(function () {
                        _this._playSessionToken = null;
                        if (!_this.autoplay)
                            return;
                        _this._currentVideoTime = 0;
                        _this.play();
                    });
                }
            };
            MJPEGPlayer._promiseImmediate().then(next);
        });
    };
    MJPEGPlayer.prototype.pause = function () {
        if (this._playSessionToken) {
            this._playSessionToken.stop = true;
            this._playSessionToken = null;
        }
    };

    Object.defineProperty(MJPEGPlayer.prototype, "videoWidth", {
        get: function () {
            if (this._src)
                return this._src.width;
            else
                return 0;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(MJPEGPlayer.prototype, "videoHeight", {
        get: function () {
            if (this._src)
                return this._src.height;
            else
                return 0;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(MJPEGPlayer.prototype, "duration", {
        get: function () {
            if (this._src)
                return this._src.duration;
            else
                return 0;
        },
        enumerable: true,
        configurable: true
    });

    MJPEGPlayer.prototype._createEvent = function () {
        return {
            bubbles: false,
            cancelable: false,
            cancelBubble: false,
            currentTarget: this,
            defaultPrevented: false,
            eventPhase: 2,
            isTrusted: true,
            target: this,
            timeStamp: Date.now(),
            type: "load"
        };
    };
    return MJPEGPlayer;
})();
//AVI File Format http://msdn.microsoft.com/en-us/library/windows/desktop/dd318187(v=vs.85).aspx
//AVI RIFF File Reference http://msdn.microsoft.com/en-us/library/windows/desktop/dd318189(v=vs.85).aspx
//AVIMAINHEADER structure http://msdn.microsoft.com/en-us/library/windows/desktop/dd318180(v=vs.85).aspx
//AVIOLDINDEX structure http://msdn.microsoft.com/en-us/library/windows/desktop/dd318181(v=vs.85).aspx
//BITMAPINFOHEADER structure http://msdn.microsoft.com/en-us/library/windows/desktop/dd318229(v=vs.85).aspx
"use strict";
/*
TODO
Return MJPEGVideo object when indices starts to be read.
Push each index as it is parsed -> _pushFrameIndices(frameIndex, frameNumber)
_pushFrameIndices should run _fill(i)
_fill is dynamically defined by getBackwardFrame/getForwardFrame, which resolves their Promises
turn completed token on when all indices are parsed
-> CHANGED: call fillFrame(Infinity) to finish all waitings.
getBackwardFrame and getForwardFrame should return Promises, as it should wait until the requested frame gets fulfilled
getBackwardFrame/getForwardFrame(i) waits until frameIndices gets larger than i + 1
getBackwardFrame then finds the penultimate valid frame, while getForwardFrame gets last one.
OR
Instead change MJPEGReader to MJPEGStream object which returns a frame when requested
Problem: It still gives files rather than indices.
Asynchronous MJPEGVideo would be prefered as of now.
*/
var MJPEGReader = (function () {
    function MJPEGReader() {
    }
    MJPEGReader.read = function (file) {
        var _this = this;
        var stream = new BlobStream(file);
        return this._consumeRiff(stream).then(function (aviMJPEG) {
            return new Promise(function (resolve, reject) {
                var mjpeg = new MJPEGVideo();
                mjpeg.blob = file;
                mjpeg.frameInterval = aviMJPEG.mainHeader.frameIntervalMicroseconds / 1e6;
                mjpeg.totalFrames = aviMJPEG.mainHeader.totalFrames;
                mjpeg.width = aviMJPEG.mainHeader.width;
                mjpeg.height = aviMJPEG.mainHeader.height;
                resolve(mjpeg);

                //after resolving
                _this._parseAVIIndex(stream, aviMJPEG.movi, aviMJPEG.idx1, function (frameNumber, frameIndex) {
                    mjpeg.fillFrameIndex(frameNumber, frameIndex);
                }).then(function () {
                    mjpeg.fillFrameIndex(Infinity);
                });
            });
        });
    };

    MJPEGReader._consumeRiff = function (stream) {
        var _this = this;
        var riffData = {
            mainHeader: null,
            movi: null,
            idx1: null
        };

        return this._consumeStructureHead(stream, "RIFF", "AVI ").then(function () {
            return _this._consumeHdrl(stream);
        }).then(function (hdrlList) {
            riffData.mainHeader = hdrlList.mainHeader;
            return _this._consumeInfo(stream);
        }).then(function () {
            return _this._consumeMovi(stream);
        }, function () {
            return _this._consumeMovi(stream);
        }).then(function (movi) {
            riffData.movi = movi;
            return _this._consumeAVIIndex(stream);
        }).then(function (idx1) {
            riffData.idx1 = idx1;
            return riffData;
        });
    };

    MJPEGReader._consumeHdrl = function (stream) {
        var _this = this;
        var endPosition;
        var hdrlData = {
            mainHeader: null
        };
        return this._consumeStructureHead(stream, "LIST", "hdrl").then(function (structure) {
            endPosition = stream.byteOffset + structure.size;
            return _this._consumeAVIMainHeader(stream);
        }).then(function (mainHeader) {
            hdrlData.mainHeader = mainHeader;
            return stream.seek(endPosition);
        }).then(function () {
            return hdrlData;
        });
        //var hdrlList = this._getTypedData(stream, "LIST", "hdrl");
        //var mainHeader = this._readAVIMainHeader(hdrlList);
        //return { dataArray: hdrlList, mainHeader: mainHeader }
    };

    MJPEGReader._consumeAVIMainHeader = function (stream) {
        var _this = this;
        var endPosition;
        var aviMainHeader = {
            frameIntervalMicroseconds: 0,
            totalFrames: 0,
            width: 0,
            height: 0
        };
        return this._consumeChunkHead(stream, "avih").then(function (chunk) {
            endPosition = stream.byteOffset + chunk.size;
            return _this._consumeUint32(stream);
        }).then(function (frameIntervalMicroseconds) {
            aviMainHeader.frameIntervalMicroseconds = frameIntervalMicroseconds;
            return stream.seek(stream.byteOffset + 12);
        }).then(function () {
            return _this._consumeUint32(stream);
        }).then(function (totalFrames) {
            aviMainHeader.totalFrames = totalFrames;
            return stream.seek(stream.byteOffset + 12);
        }).then(function () {
            return _this._consumeUint32(stream);
        }).then(function (width) {
            aviMainHeader.width = width;
            return _this._consumeUint32(stream);
        }).then(function (height) {
            aviMainHeader.height = height;
            return stream.seek(endPosition);
        }).then(function () {
            return aviMainHeader;
        });
    };

    MJPEGReader._consumeInfo = function (stream) {
        return this._consumeStructureHead(stream, "LIST", "INFO").then(function (structure) {
            return stream.seek(stream.byteOffset + structure.size);
        });
    };

    MJPEGReader._consumeMovi = function (stream) {
        var moviStructure;
        return this._consumeStructureHead(stream, "LIST", "movi").then(function (structure) {
            moviStructure = structure;
            return stream.seek(stream.byteOffset + structure.size);
        }).then(function () {
            return moviStructure;
        });
        //return { dataArray: moviList };
    };

    MJPEGReader._consumeAVIIndex = function (stream) {
        var idx1Chunk;
        return this._consumeChunkHead(stream, "idx1").then(function (chunk) {
            idx1Chunk = chunk;
            return stream.seek(stream.byteOffset + chunk.size);
        }).then(function () {
            return idx1Chunk;
        });
    };

    MJPEGReader._parseAVIIndex = function (stream, movi, idx1, onframeparse) {
        var _this = this;
        return stream.seek(idx1.contentOffset).then(function () {
            var indexes = [];

            var sequence = Promise.resolve();
            for (var i = 0; i < idx1.size / 16; i++) {
                (function (i) {
                    var index = {
                        byteOffset: 0,
                        byteLength: 0
                    };
                    sequence = sequence.then(function () {
                        return stream.seek(stream.byteOffset + 8);
                    }).then(function () {
                        return _this._consumeUint32(stream);
                    }).then(function (offset) {
                        index.byteOffset = movi.contentOffset + offset + 4; // ignore 'movi' string and frame chunk header (-4 + 8)
                        return _this._consumeUint32(stream);
                    }).then(function (length) {
                        index.byteLength = length - 8; // ignore frame chunk header size
                        if (length > 0) {
                            if (onframeparse)
                                onframeparse(i, index);
                            indexes[i] = index;
                        }
                    });
                })(i);
            }
            return sequence.then(function () {
                return Promise.resolve(indexes);
            });
        });
    };

    MJPEGReader._consumeStructureHead = function (stream, name, subtype, sliceContent) {
        var _this = this;
        if (typeof sliceContent === "undefined") { sliceContent = false; }
        var head = {};

        return this._consumeFourCC(stream).then(function (nameParam) {
            head.name = nameParam;
            return _this._consumeUint32(stream);
        }).then(function (sizeParam) {
            head.size = sizeParam - 4; // size without subtype

            if (head.name === name)
                return _this._consumeFourCC(stream).then(function (subtypeParam) {
                    if (subtypeParam !== subtype)
                        return Promise.reject(new Error("Unexpected name is detected for AVI structure."));

                    head.contentOffset = stream.byteOffset;
                    if (sliceContent)
                        head.slicedContent = stream.slice(stream.byteOffset, stream.byteOffset + head.size);
                    return Promise.resolve(head);
                });
            else if (head.name === "JUNK")
                return stream.seek(stream.byteOffset + sizeParam).then(function () {
                    return _this._consumeStructureHead(stream, name, subtype, sliceContent);
                });
            else
                return Promise.reject(new Error("Incorrect AVI format."));
        });
    };
    MJPEGReader._consumeChunkHead = function (stream, id) {
        var _this = this;
        var head = {};

        return this._consumeFourCC(stream).then(function (idParam) {
            head.id = idParam;
            return _this._consumeUint32(stream);
        }).then(function (sizeParam) {
            head.size = sizeParam;

            if (head.id === id) {
                head.contentOffset = stream.byteOffset;
                return Promise.resolve(head);
            } else if (head.id === "JUNK")
                return stream.seek(stream.byteOffset + sizeParam).then(function () {
                    return _this._consumeChunkHead(stream, id);
                });
            else
                return Promise.reject(new Error("Unexpected id is detected for AVI chunk."));
        });
    };

    MJPEGReader._consumeFourCC = function (stream) {
        return new Promise(function (resolve, reject) {
            stream.readBytesAs = "text";
            var promise = stream.readBytes(4).then(function (result) {
                resolve(result.data);
            });
            stream.readBytesAs = "as-is";
        });
    };

    MJPEGReader._consumeUint32 = function (stream) {
        return stream.readBytes(4).then(function (result) {
            var dataView = new DataView(result.data);
            return dataView.getUint32(0, true);
        });
    };
    return MJPEGReader;
})();

var MJPEGVideo = (function () {
    function MJPEGVideo() {
        this.frameIndices = [];
    }
    Object.defineProperty(MJPEGVideo.prototype, "framePerSecond", {
        get: function () {
            return 1 / this.frameInterval;
        },
        enumerable: true,
        configurable: true
    });

    Object.defineProperty(MJPEGVideo.prototype, "duration", {
        get: function () {
            return this.totalFrames * this.frameInterval;
        },
        enumerable: true,
        configurable: true
    });

    MJPEGVideo.prototype.fillFrameIndex = function (frameNumber, frameIndex) {
        if (frameIndex)
            this.frameIndices[frameNumber] = frameIndex;

        if (this._onfulfilled)
            this._onfulfilled(frameNumber);
    };

    MJPEGVideo.prototype.getFrame = function (index) {
        return this.getBackwardFrame(index).then(function (frameIndex) {
            if (frameIndex)
                return frameIndex.data;
            else
                return;
        });
    };
    MJPEGVideo.prototype.getFrameByTime = function (time) {
        return this.getFrame(Math.floor(this.totalFrames * time / this.duration));
    };

    /**
    Wait until the existence of target frame gets confirmed.
    */
    MJPEGVideo.prototype._waitFrame = function (index) {
        var _this = this;
        if (index >= this.totalFrames || index < 0)
            return Promise.reject(new Error("Index is outside of range."));

        if (index < this.frameIndices.length)
            return Promise.resolve();

        return new Promise(function (resolve, reject) {
            _this._onfulfilled = function (i) {
                if (i >= index)
                    resolve(undefined);
            };
        });
    };

    MJPEGVideo.prototype.getBackwardFrame = function (index) {
        var _this = this;
        index = Math.ceil(index);
        return this._waitFrame(index).then(function () {
            var i = index;
            while (i >= 0) {
                if (_this.frameIndices[i])
                    return Promise.resolve({ index: i, data: _this._exportJPEG(_this.frameIndices[i]) });
                else
                    i--;
            }
            return Promise.reject(new Error("No backward frame was found for index " + index + "."));
        });
    };

    MJPEGVideo.prototype.getForwardFrame = function (index) {
        var _this = this;
        index = Math.floor(index);
        return this._waitFrame(index).then(function () {
            var i = index;
            while (i < _this.frameIndices.length) {
                if (_this.frameIndices[i])
                    return Promise.resolve({ index: i, data: _this._exportJPEG(_this.frameIndices[i]) });
                else
                    i++;
            }
            return Promise.reject(new Error("No forward frame was found for index " + index + "."));
        });
    };

    MJPEGVideo.prototype._exportJPEG = function (frameIndex) {
        return this.blob.slice(frameIndex.byteOffset, frameIndex.byteOffset + frameIndex.byteLength, "image/jpeg");
    };
    return MJPEGVideo;
})();
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/*
W3C ISO BMFF Byte Stream Format
ISO/IEC 14496-12:2012(E)
*/
var MP4Container;
(function (MP4Container) {
    //numbers are big endianed
    //4.2 Object Structure
    var Box = (function () {
        function Box(boxType, extendedType) {
            this.type = boxType;
        }
        Box.prototype.getByteLength = function () {
            return 4;
            //0 and 1 are special values
        };
        return Box;
    })();
    MP4Container.Box = Box;
    var FullBox = (function (_super) {
        __extends(FullBox, _super);
        function FullBox(boxType, version) {
            _super.call(this, boxType);
            this.version = version;
            this.flags = 0;
        }
        FullBox.prototype.getByteLength = function () {
            return _super.prototype.getByteLength.call(this) + 1 + 3;
        };
        return FullBox;
    })(Box);
    MP4Container.FullBox = FullBox;

    //class UuidBox extends Box {
    //    userType = new Uint8Array(16);
    //    constructor() {
    //        super("uuid");
    //    }
    //}
    /*
    W3C 3. Initialization Segments
    
    An ISO BMFF initialization segment is defined in this specification as
    a single File Type Box (ftyp) followed by a single Movie Header Box (moov).
    
    Valid top-level boxes such as pdin, free, and sidx ...
    ... other than ftyp, moov, styp, moof, and mdat ...
    ... ignored by the user agent and are not considered part of the
    initialization segment in this specification.
    
    ISO/IEC 6.2.3 Box Order
    */
    // ISO/IEC 4.3
    var FileTypeBox = (function (_super) {
        __extends(FileTypeBox, _super);
        function FileTypeBox() {
            _super.call(this, "ftyp");
            this.majorBrand = "mp41";
            this.majorVersion = 0;
            this.compatibleBrands = ["mp41"];
        }
        FileTypeBox.prototype.getByteLength = function () {
            return _super.prototype.getByteLength.call(this) + 4 + 4 + 4;
        };
        return FileTypeBox;
    })(Box);
    MP4Container.FileTypeBox = FileTypeBox;

    //ISO/IEC 8.2.1
    var MovieBox = (function (_super) {
        __extends(MovieBox, _super);
        function MovieBox() {
            _super.call(this, "moov");
        }
        return MovieBox;
    })(Box);
    MP4Container.MovieBox = MovieBox;

    //ISO/IEC 8.8.4
    var MovieFragmentBox = (function (_super) {
        __extends(MovieFragmentBox, _super);
        function MovieFragmentBox(boxes) {
            _super.call(this, "moof");
            this.boxes = boxes;
        }
        MovieFragmentBox.prototype.getByteLength = function () {
            var byteLength = _super.prototype.getByteLength.call(this) + this.boxes.movieFragmentHeader.getByteLength();
            if (this.boxes.trackFragment)
                byteLength += this.boxes.trackFragment.getByteLength();
            return byteLength;
        };
        return MovieFragmentBox;
    })(Box);
    MP4Container.MovieFragmentBox = MovieFragmentBox;

    //ISO/IEC 8.8.5
    var MovieFragmentHeaderBox = (function (_super) {
        __extends(MovieFragmentHeaderBox, _super);
        function MovieFragmentHeaderBox() {
            _super.call(this, "mfhd", 0);
        }
        MovieFragmentHeaderBox.prototype.getByteLength = function () {
            return _super.prototype.getByteLength.call(this) + 4;
        };
        return MovieFragmentHeaderBox;
    })(FullBox);
    MP4Container.MovieFragmentHeaderBox = MovieFragmentHeaderBox;

    //ISO/IEC 8.8.6
    var TrackFragmentBox = (function (_super) {
        __extends(TrackFragmentBox, _super);
        function TrackFragmentBox(boxes) {
            _super.call(this, "traf");
            this.boxes = boxes;
        }
        return TrackFragmentBox;
    })(Box);
    MP4Container.TrackFragmentBox = TrackFragmentBox;

    //ISO/IEC 8.8.7
    var TrackFragmentHeaderBox = (function (_super) {
        __extends(TrackFragmentHeaderBox, _super);
        function TrackFragmentHeaderBox(tfFlags) {
            _super.call(this, "tfhd", 0);
            this.tfFlags = tfFlags;
        }
        Object.defineProperty(TrackFragmentHeaderBox.prototype, "flagBits", {
            get: function () {
                return this.tfFlags.getFlagBits();
            },
            enumerable: true,
            configurable: true
        });
        return TrackFragmentHeaderBox;
    })(FullBox);
    MP4Container.TrackFragmentHeaderBox = TrackFragmentHeaderBox;
    var TrackFragmentHeaderFlags = (function () {
        function TrackFragmentHeaderFlags() {
        }
        TrackFragmentHeaderFlags.prototype.getFlagBits = function () {
            var flag = 0;
            if (this.baseDateOffsetPresent)
                flag |= 0x000001;
            if (this.sampleDescriptionIndexPresent)
                flag |= 0x000002;
            if (this.defaultSampleDurationPresent)
                flag |= 0x000008;
            if (this.defaultSampleSizePresent)
                flag |= 0x000010;
            if (this.defaultSampleFlagsPresent)
                flag |= 0x000020;
            if (this.durationIsEmpty)
                flag |= 0x010000;
            if (this.defaultBaseIsMoof)
                flag |= 0x020000;
            return flag;
        };
        return TrackFragmentHeaderFlags;
    })();
    MP4Container.TrackFragmentHeaderFlags = TrackFragmentHeaderFlags;
})(MP4Container || (MP4Container = {}));
//# sourceMappingURL=mjpegdecoder.js.map
