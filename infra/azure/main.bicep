targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment, used to generate unique resource names.')
param environmentName string

@minLength(1)
@description('Primary Azure region for all resources.')
param location string

@secure()
@description('OpenClaw gateway authentication token.')
param openclawGatewayToken string = ''

@secure()
@description('Anthropic API key (optional).')
param anthropicApiKey string = ''

@secure()
@description('OpenAI API key (optional).')
param openaiApiKey string = ''

@description('CPU cores for the container.')
param containerCpu int = 1

@description('Memory in GB for the container.')
param containerMemory int = 2

@description('DNS name label for the container group public IP.')
param dnsNameLabel string = ''

var tags = { 'azd-env-name': environmentName }
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))

resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module resources './resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    openclawGatewayToken: openclawGatewayToken
    anthropicApiKey: anthropicApiKey
    openaiApiKey: openaiApiKey
    containerCpu: containerCpu
    containerMemory: containerMemory
    dnsNameLabel: dnsNameLabel
  }
}

output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.containerRegistryLoginServer
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.containerRegistryName
output OPENCLAW_URL string = resources.outputs.fqdn
output OPENCLAW_IP string = resources.outputs.ipAddress
