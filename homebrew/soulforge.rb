# typed: false
# frozen_string_literal: true

class Soulforge < Formula
  desc "AI-Powered Terminal IDE — Neovim + Multi-Agent + Graph Code Intelligence"
  homepage "https://github.com/ProxySoul/soulforge"
  version "1.0.0"
  license "BUSL-1.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/ProxySoul/soulforge/releases/download/v#{version}/soulforge-darwin-arm64.tar.gz"
      sha256 "PLACEHOLDER"
    end
    if Hardware::CPU.intel?
      url "https://github.com/ProxySoul/soulforge/releases/download/v#{version}/soulforge-darwin-x64.tar.gz"
      sha256 "PLACEHOLDER"
    end
  end

  on_linux do
    if Hardware::CPU.arm? && Hardware::CPU.is_64_bit?
      url "https://github.com/ProxySoul/soulforge/releases/download/v#{version}/soulforge-linux-arm64.tar.gz"
      sha256 "PLACEHOLDER"
    end
    if Hardware::CPU.intel?
      url "https://github.com/ProxySoul/soulforge/releases/download/v#{version}/soulforge-linux-x64.tar.gz"
      sha256 "PLACEHOLDER"
    end
  end

  def install
    # Binary inside tar is named soulforge-{platform}-{arch}, rename to soulforge
    Dir["soulforge-*"].each do |f|
      next unless File.file?(f)

      mv f, "soulforge"
    end
    bin.install "soulforge"
    bin.install_symlink "soulforge" => "sf"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/soulforge --version")
  end
end
