{
  description = "Video Speed Controller Firefox dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = {
    self,
    nixpkgs,
  }: let
    systems = ["x86_64-linux" "aarch64-linux"];
    forAllSystems = nixpkgs.lib.genAttrs systems;
  in {
    devShells = forAllSystems (system: let
      pkgs = import nixpkgs {inherit system;};
    in {
      default = pkgs.mkShell {
        packages = [
          pkgs.nodejs_22
          pkgs.web-ext
          pkgs.git
          pkgs.zip
        ];

        shellHook = ''
          echo "VideoSpeed Firefox dev shell"
          echo "Run: npm ci && npm run build"
        '';
      };
    });
  };
}
