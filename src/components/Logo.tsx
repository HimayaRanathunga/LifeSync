import React from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

const logoSource = require('../../assets/logo.png');

interface LogoProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export default function Logo({ size = 72, style }: LogoProps) {
  return (
    <Image
      source={logoSource}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityLabel="LifeSync logo"
    />
  );
}
