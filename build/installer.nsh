!macro customInstall
  CreateDirectory "$DOCUMENTS\MDP Sales"
  File "/oname=$DOCUMENTS\MDP Sales\config.yaml" "${BUILD_RESOURCES_DIR}\..\config.yaml"
!macroend
