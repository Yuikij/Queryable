const path = require('path');

module.exports = {
  mode: 'production',
  entry: {
    offscreen_bundled: './src/offscreen_entry.js', // Offscreen Document
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname),
  },
  target: 'web', // Offscreen Document 有完整 DOM 环境
  resolve: {
    extensions: ['.js'],
    fallback: {
      "path": false,
      "fs": false,
      "url": false,
      "crypto": false,
      "buffer": false,
      "stream": false,
      "util": false,
      "http": false,
      "https": false,
      "zlib": false
    }
  },
  optimization: {
    minimize: false  // 方便调试，可以改为 true 减小体积
  },
  performance: {
    maxEntrypointSize: 10000000,
    maxAssetSize: 10000000
  }
};

