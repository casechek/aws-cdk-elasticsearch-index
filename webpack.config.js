const path = require('path');

module.exports = (env, argv) => {
  const config = {
    mode: 'development',
    target: 'node',
    devtool: 'eval-source-map',
    entry: {
      'on-event': './src/on-event/on-event.ts',
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                configFile: 'tsconfig.src.json'
              },
            },
          ],
          exclude: [
            /test/,
            /cdk.out/,
            /lib/,
            /node_modules/,
          ],
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
    externals: ['aws-sdk'],
    output: {
      filename: '[name]/[name].js',
      path: path.resolve(__dirname, 'dist', 'resources'),
      libraryTarget: 'commonjs',
    },
    optimization: {
      minimize: false,
    },
  };

  if (argv.mode === 'production') {
    delete config.devtool;
  }

  return config;
};
