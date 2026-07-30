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
    mkPkgs = system: import nixpkgs {inherit system;};
  in {
    devShells = forAllSystems (system: let
      pkgs = mkPkgs system;
    in {
      default = pkgs.mkShellNoCC {
        packages = [
          pkgs.nodejs_22
          pkgs.web-ext
        ];

        shellHook = ''
          echo "VideoSpeed Firefox dev shell"
          echo "Run: npm ci && npm run build"
        '';
      };
    });

    formatter = forAllSystems (system: (mkPkgs system).alejandra);
  };
}
