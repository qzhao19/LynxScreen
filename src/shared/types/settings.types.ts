// WebRTC ICE server configuration object
export interface IceServerConfig {
  urls: string
  username?:  string
  credential?: string
}

// Application settings data structure
export interface AppSettings {
  username: string
  color: string
  language: string
  isMicrophoneEnabledOnConnect: boolean
  iceServers: IceServerConfig[]
}


