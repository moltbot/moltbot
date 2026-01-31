param location string
param tags object
param resourceToken string

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

// ---------------------------------------------------------------------------
// Azure Container Registry
// ---------------------------------------------------------------------------
resource acr 'Microsoft.ContainerRegistry/registries@2023-01-01-preview' = {
  name: 'cr${resourceToken}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

// ---------------------------------------------------------------------------
// Storage Account + File Share (persistent state)
// ---------------------------------------------------------------------------
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'st${resourceToken}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileService
  name: 'openclaw-data'
  properties: {
    shareQuota: 1
  }
}

// ---------------------------------------------------------------------------
// Log Analytics Workspace
// ---------------------------------------------------------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'log-${resourceToken}'
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    sku: { name: 'PerGB2018' }
  }
}

// ---------------------------------------------------------------------------
// Container Instance
// ---------------------------------------------------------------------------
var effectiveDnsLabel = !empty(dnsNameLabel) ? dnsNameLabel : 'openclaw-${resourceToken}'

resource containerGroup 'Microsoft.ContainerInstance/containerGroups@2023-05-01' = {
  name: 'ci-${resourceToken}'
  location: location
  tags: tags
  properties: {
    containers: [
      {
        name: 'openclaw'
        properties: {
          image: '${acr.properties.loginServer}/openclaw:latest'
          command: [
            'node'
            'dist/index.mjs'
            'gateway'
            '--allow-unconfigured'
            '--port'
            '18789'
            '--bind'
            'lan'
          ]
          ports: [
            { port: 18789, protocol: 'TCP' }
          ]
          environmentVariables: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'NODE_OPTIONS', value: '--max-old-space-size=1536' }
            { name: 'OPENCLAW_STATE_DIR', value: '/data' }
            { name: 'OPENCLAW_PREFER_PNPM', value: '1' }
            { name: 'OPENCLAW_GATEWAY_TOKEN', secureValue: openclawGatewayToken }
            { name: 'ANTHROPIC_API_KEY', secureValue: anthropicApiKey }
            { name: 'OPENAI_API_KEY', secureValue: openaiApiKey }
          ]
          resources: {
            requests: {
              cpu: containerCpu
              memoryInGB: containerMemory
            }
          }
          volumeMounts: [
            {
              name: 'openclaw-data'
              mountPath: '/data'
            }
          ]
          livenessProbe: {
            httpGet: {
              path: '/'
              port: 18789
              scheme: 'http'
            }
            initialDelaySeconds: 300
            periodSeconds: 30
            failureThreshold: 5
          }
        }
      }
    ]
    osType: 'Linux'
    restartPolicy: 'Always'
    ipAddress: {
      type: 'Public'
      ports: [
        { port: 18789, protocol: 'TCP' }
      ]
      dnsNameLabel: effectiveDnsLabel
    }
    imageRegistryCredentials: [
      {
        server: acr.properties.loginServer
        username: acr.listCredentials().username
        password: acr.listCredentials().passwords[0].value
      }
    ]
    volumes: [
      {
        name: 'openclaw-data'
        azureFile: {
          shareName: fileShare.name
          storageAccountName: storageAccount.name
          storageAccountKey: storageAccount.listKeys().keys[0].value
        }
      }
    ]
    diagnostics: {
      logAnalytics: {
        workspaceId: logAnalytics.properties.customerId
        workspaceKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output containerRegistryLoginServer string = acr.properties.loginServer
output containerRegistryName string = acr.name
output fqdn string = 'http://${containerGroup.properties.ipAddress.fqdn}:18789'
output ipAddress string = containerGroup.properties.ipAddress.ip
