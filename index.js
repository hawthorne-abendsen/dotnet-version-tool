const core = require('@actions/core')
const github = require('@actions/github')
const fs = require('fs')
const xmldom = require('xmldom')
const DOMParser = xmldom.DOMParser
const XMLSerializer = xmldom.XMLSerializer
const globby = require('globby')

const projectTagName = 'Project'
const assemblyVersionTagName = 'AssemblyVersion'
const fileVersionTagName = 'FileVersion'
const propertyGroupTagName = 'PropertyGroup'

const regex = /^[0-9]+\.[0-9]+\.[0-9]+$/

function tryParseJson(json) {
    try {
        return JSON.parse(json)
    } catch (err) {
        return null
    }
}

/**
 * 
 * @param {DOMParser} projectObject 
 * @param {HTMLElement} projectElement 
 * @param {string} tagName 
 * @param {string} version 
 */
function setProjectVersion(projectObject, projectElement, tagName, version) {
    let versionElement = null
    const versionElements = projectObject.getElementsByTagName(tagName)
    if (versionElements.length > 1)
        throw new Error(`Project file contains multiple '${tagName}' elements.`)
    else if (versionElements.length === 1)
        versionElement = versionElements[0]
    else {
        let propertiesGroupElement = null
        const propertiesGroupElements = projectObject.getElementsByTagName(propertyGroupTagName)
        if (propertiesGroupElements.length === 0) {
            propertiesGroupElement = projectObject.createElement(propertyGroupTagName)
            projectElement.appendChild(propertiesGroupElement)
        } else
            propertiesGroupElement = propertiesGroupElements[0]

        versionElement = projectObject.createElement(tagName)
        propertiesGroupElement.appendChild(versionElement)
    }
    versionElement.textContent = version
}

function getPattern() {
    const projectsToSet = core.getInput('projects')
    let pattern = tryParseJson(projectsToSet) || []
    if (typeof projectsToSet == 'string' && projectsToSet)
        pattern = [projectsToSet]

    if (pattern.length < 1)
        throw new Error('Project files pattern is not specified, or invalid.')
    return pattern
}

function getVersion() {
    let version = core.getInput('version')
    if (!version)
        throw new Error('Version is not specified.')
    if (version.startsWith('v'))
        version = version.substr(1)
    if (!regex.test(version))
        throw new Error('Invalid version format.')
    return version
}

async function getProjectFilesToUpdate(pattern) {
    const projectFiles = (await globby(pattern, {
        gitignore: true,
        expandDirectories: true,
        onlyFiles: true,
        ignore: [],
        cwd: process.cwd()
    })).filter(p => p.endsWith('.csproj'))
    if (projectFiles.length < 1)
        throw new Error('No project files found.')
    return projectFiles
}

function setVersion(version, projectFiles) {
    for (let proj of projectFiles) {
        const projectFileContent = fs.readFileSync(proj, { encoding: 'utf8' })
        const projectObject = new DOMParser().parseFromString(projectFileContent)
        if (projectObject.documentElement.tagName !== projectTagName)
            throw new Error('Invalid project file format.')
        const projectElement = projectObject.documentElement
        setProjectVersion(projectObject, projectElement, assemblyVersionTagName, version)
        setProjectVersion(projectObject, projectElement, fileVersionTagName, version)
        fs.writeFileSync(proj, projectObject.textContent)
    }
}

async function run() {

    const version = getVersion()
    const pattern = getPattern()

    const projectFiles = await getProjectFilesToUpdate(pattern)
    setVersion(version, projectFiles)
}

run()
.then(_ => {
    const versionIsSetMsg = 'Version is set.'
    console.log(versionIsSetMsg)
    core.info(versionIsSetMsg)
})
.catch(err => {
    console.error(err)
    core.setFailed(err.message)
})